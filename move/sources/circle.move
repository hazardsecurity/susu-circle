/// Susu Circle: a rotating savings circle (susu / esusu / tontine) on Sui.
///
/// How it works
/// 1. A creator opens a circle: a fixed contribution per round, a round
///    length, a member cap, and a security deposit every member must lock.
/// 2. Members join by locking the same deposit.
/// 3. The creator starts the circle. Sui's on-chain randomness shuffles the
///    payout order, so nobody can game who gets paid first.
/// 4. Every round, each member contributes. When everyone has paid (or the
///    round deadline passes) anyone can trigger the payout: the whole pot goes
///    to that round's recipient.
/// 5. Anyone who missed a round has their deposit slashed to cover the
///    missing contribution, and gets a strike. The recipient is always made
///    whole as far as the defaulter's deposit allows.
/// 6. After the last round, members withdraw whatever is left of their deposit.
///
/// The circle is generic over the coin type `T`, so it works with SUI, USDC,
/// or any other coin.
module susu::circle;

use std::string::String;
use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;
use sui::random::{Random, RandomGenerator};
use sui::vec_map::{Self, VecMap};
use sui::vec_set::{Self, VecSet};

// === Status ===

const STATUS_OPEN: u8 = 0;
const STATUS_ACTIVE: u8 = 1;
const STATUS_COMPLETE: u8 = 2;
const STATUS_CANCELLED: u8 = 3;

// === Limits ===

const MIN_MEMBERS: u64 = 2;
const MAX_MEMBERS: u64 = 20;

// === Errors ===

const EInvalidContribution: u64 = 0;
const EInvalidMemberCap: u64 = 1;
const EInvalidRoundDuration: u64 = 2;
const EDepositTooSmall: u64 = 3;
const EWrongDepositAmount: u64 = 4;
const ENotOpen: u64 = 5;
const ENotActive: u64 = 6;
const ENotComplete: u64 = 7;
const ECircleFull: u64 = 8;
const EAlreadyMember: u64 = 9;
const ENotMember: u64 = 10;
const ENotCreator: u64 = 11;
const ENotEnoughMembers: u64 = 12;
const EWrongContributionAmount: u64 = 13;
const EAlreadyPaid: u64 = 14;
const ERoundNotReady: u64 = 15;
const ECreatorCannotLeave: u64 = 16;
const ENoDeposit: u64 = 17;

// === Objects ===

/// A savings circle. Shared, so every member can interact with it.
public struct Circle<phantom T> has key {
    id: UID,
    name: String,
    creator: address,
    /// Amount each member pays every round.
    contribution: u64,
    /// Security deposit each member locks on joining.
    deposit: u64,
    max_members: u64,
    round_duration_ms: u64,
    status: u8,
    /// Join order while open; randomized payout order once started.
    members: vector<address>,
    /// Index into `members` of the current round's recipient.
    round: u64,
    round_started_ms: u64,
    /// Members who have contributed in the current round.
    paid: VecSet<address>,
    /// Contributions collected for the current round.
    pot: Balance<T>,
    /// Remaining security deposit per member.
    deposits: VecMap<address, Balance<T>>,
    /// Missed rounds per member.
    strikes: VecMap<address, u64>,
    /// Total paid out so far.
    total_paid_out: u64,
}

// === Events ===

public struct CircleCreated has copy, drop {
    circle_id: ID,
    creator: address,
    name: String,
    contribution: u64,
    deposit: u64,
    max_members: u64,
    round_duration_ms: u64,
}

public struct MemberJoined has copy, drop { circle_id: ID, member: address }

public struct MemberLeft has copy, drop { circle_id: ID, member: address }

public struct CircleStarted has copy, drop {
    circle_id: ID,
    payout_order: vector<address>,
    started_ms: u64,
}

public struct Contributed has copy, drop {
    circle_id: ID,
    member: address,
    round: u64,
    amount: u64,
}

public struct Defaulted has copy, drop {
    circle_id: ID,
    member: address,
    round: u64,
    slashed: u64,
}

public struct PaidOut has copy, drop {
    circle_id: ID,
    recipient: address,
    round: u64,
    amount: u64,
}

public struct CircleCompleted has copy, drop { circle_id: ID }

public struct CircleCancelled has copy, drop { circle_id: ID }

public struct DepositWithdrawn has copy, drop {
    circle_id: ID,
    member: address,
    amount: u64,
}

// === Lifecycle ===

/// Open a new circle. The creator joins automatically by locking `deposit`,
/// and the deposit's value becomes the required deposit for everyone.
public fun create<T>(
    name: String,
    contribution: u64,
    max_members: u64,
    round_duration_ms: u64,
    deposit: Coin<T>,
    ctx: &mut TxContext,
): ID {
    assert!(contribution > 0, EInvalidContribution);
    assert!(max_members >= MIN_MEMBERS && max_members <= MAX_MEMBERS, EInvalidMemberCap);
    assert!(round_duration_ms > 0, EInvalidRoundDuration);
    // The deposit must cover at least one missed contribution.
    let deposit_amount = deposit.value();
    assert!(deposit_amount >= contribution, EDepositTooSmall);

    let creator = ctx.sender();
    let mut deposits = vec_map::empty();
    deposits.insert(creator, deposit.into_balance());
    let mut strikes = vec_map::empty();
    strikes.insert(creator, 0);

    let circle = Circle<T> {
        id: object::new(ctx),
        name,
        creator,
        contribution,
        deposit: deposit_amount,
        max_members,
        round_duration_ms,
        status: STATUS_OPEN,
        members: vector[creator],
        round: 0,
        round_started_ms: 0,
        paid: vec_set::empty(),
        pot: balance::zero(),
        deposits,
        strikes,
        total_paid_out: 0,
    };
    let circle_id = object::id(&circle);

    event::emit(CircleCreated {
        circle_id,
        creator,
        name: circle.name,
        contribution,
        deposit: deposit_amount,
        max_members,
        round_duration_ms,
    });
    event::emit(MemberJoined { circle_id, member: creator });

    transfer::share_object(circle);
    circle_id
}

/// Join an open circle by locking exactly the required deposit.
public fun join<T>(circle: &mut Circle<T>, deposit: Coin<T>, ctx: &TxContext) {
    let member = ctx.sender();
    assert!(circle.status == STATUS_OPEN, ENotOpen);
    assert!(!circle.members.contains(&member), EAlreadyMember);
    assert!(circle.members.length() < circle.max_members, ECircleFull);
    assert!(deposit.value() == circle.deposit, EWrongDepositAmount);

    circle.members.push_back(member);
    circle.deposits.insert(member, deposit.into_balance());
    circle.strikes.insert(member, 0);

    event::emit(MemberJoined { circle_id: object::id(circle), member });
}

/// Leave a circle before it starts and get the deposit back.
#[allow(lint(self_transfer))]
public fun leave<T>(circle: &mut Circle<T>, ctx: &mut TxContext) {
    let member = ctx.sender();
    assert!(circle.status == STATUS_OPEN, ENotOpen);
    assert!(member != circle.creator, ECreatorCannotLeave);
    let (found, idx) = circle.members.index_of(&member);
    assert!(found, ENotMember);

    circle.members.remove(idx);
    let (_, bal) = circle.deposits.remove(&member);
    circle.strikes.remove(&member);
    transfer::public_transfer(coin::from_balance(bal, ctx), member);

    event::emit(MemberLeft { circle_id: object::id(circle), member });
}

/// Creator cancels a circle that has not started. Every deposit is refunded.
public fun cancel<T>(circle: &mut Circle<T>, ctx: &mut TxContext) {
    assert!(circle.status == STATUS_OPEN, ENotOpen);
    assert!(ctx.sender() == circle.creator, ENotCreator);

    while (!circle.deposits.is_empty()) {
        let (member, bal) = circle.deposits.remove_entry_by_idx(0);
        transfer::public_transfer(coin::from_balance(bal, ctx), member);
    };
    circle.status = STATUS_CANCELLED;

    event::emit(CircleCancelled { circle_id: object::id(circle) });
}

/// Creator starts the circle. On-chain randomness shuffles the payout order.
/// `entry` (not `public`) so the random draw cannot be inspected or reverted
/// by a composing transaction.
entry fun start<T>(circle: &mut Circle<T>, r: &Random, clock: &Clock, ctx: &mut TxContext) {
    let mut g = r.new_generator(ctx);
    start_with(circle, &mut g, clock, ctx);
}

fun start_with<T>(
    circle: &mut Circle<T>,
    g: &mut RandomGenerator,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(circle.status == STATUS_OPEN, ENotOpen);
    assert!(ctx.sender() == circle.creator, ENotCreator);
    assert!(circle.members.length() >= MIN_MEMBERS, ENotEnoughMembers);

    g.shuffle(&mut circle.members);
    circle.status = STATUS_ACTIVE;
    circle.round = 0;
    circle.round_started_ms = clock.timestamp_ms();

    event::emit(CircleStarted {
        circle_id: object::id(circle),
        payout_order: circle.members,
        started_ms: circle.round_started_ms,
    });
}

/// Pay this round's contribution.
public fun contribute<T>(circle: &mut Circle<T>, payment: Coin<T>, ctx: &TxContext) {
    let member = ctx.sender();
    assert!(circle.status == STATUS_ACTIVE, ENotActive);
    assert!(circle.members.contains(&member), ENotMember);
    assert!(!circle.paid.contains(&member), EAlreadyPaid);
    let amount = payment.value();
    assert!(amount == circle.contribution, EWrongContributionAmount);

    circle.pot.join(payment.into_balance());
    circle.paid.insert(member);

    event::emit(Contributed {
        circle_id: object::id(circle),
        member,
        round: circle.round,
        amount,
    });
}

/// Settle the current round and pay the recipient. Anyone can call this once
/// every member has contributed, or once the round deadline has passed. Any
/// member who has not paid by then is slashed from their deposit.
public fun payout<T>(circle: &mut Circle<T>, clock: &Clock, ctx: &mut TxContext) {
    assert!(circle.status == STATUS_ACTIVE, ENotActive);
    let now = clock.timestamp_ms();
    let n = circle.members.length();
    let all_paid = circle.paid.length() == n;
    let deadline_passed = now >= round_deadline_ms(circle);
    assert!(all_paid || deadline_passed, ERoundNotReady);

    let circle_id = object::id(circle);
    let round = circle.round;

    // Slash defaulters.
    if (!all_paid) {
        let mut i = 0;
        while (i < n) {
            let member = circle.members[i];
            if (!circle.paid.contains(&member)) {
                let dep = &mut circle.deposits[&member];
                let take = if (dep.value() < circle.contribution) dep.value()
                else circle.contribution;
                circle.pot.join(dep.split(take));
                let s = &mut circle.strikes[&member];
                *s = *s + 1;
                event::emit(Defaulted { circle_id, member, round, slashed: take });
            };
            i = i + 1;
        };
    };

    // Pay the recipient.
    let recipient = circle.members[round];
    let amount = circle.pot.value();
    if (amount > 0) {
        let payout = coin::from_balance(circle.pot.withdraw_all(), ctx);
        transfer::public_transfer(payout, recipient);
    };
    circle.total_paid_out = circle.total_paid_out + amount;
    event::emit(PaidOut { circle_id, recipient, round, amount });

    // Advance.
    circle.round = round + 1;
    circle.paid = vec_set::empty();
    circle.round_started_ms = now;
    if (circle.round == n) {
        circle.status = STATUS_COMPLETE;
        event::emit(CircleCompleted { circle_id });
    };
}

/// After the circle completes, withdraw what is left of your deposit.
#[allow(lint(self_transfer))]
public fun withdraw_deposit<T>(circle: &mut Circle<T>, ctx: &mut TxContext) {
    let member = ctx.sender();
    assert!(circle.status == STATUS_COMPLETE, ENotComplete);
    assert!(circle.deposits.contains(&member), ENoDeposit);

    let (_, bal) = circle.deposits.remove(&member);
    let amount = bal.value();
    if (amount > 0) {
        transfer::public_transfer(coin::from_balance(bal, ctx), member);
    } else {
        bal.destroy_zero();
    };

    event::emit(DepositWithdrawn { circle_id: object::id(circle), member, amount });
}

// === Views ===

public fun name<T>(c: &Circle<T>): String { c.name }

public fun creator<T>(c: &Circle<T>): address { c.creator }

public fun contribution<T>(c: &Circle<T>): u64 { c.contribution }

public fun deposit_amount<T>(c: &Circle<T>): u64 { c.deposit }

public fun max_members<T>(c: &Circle<T>): u64 { c.max_members }

public fun status<T>(c: &Circle<T>): u8 { c.status }

public fun members<T>(c: &Circle<T>): vector<address> { c.members }

public fun member_count<T>(c: &Circle<T>): u64 { c.members.length() }

public fun is_member<T>(c: &Circle<T>, a: address): bool { c.members.contains(&a) }

public fun round<T>(c: &Circle<T>): u64 { c.round }

public fun has_paid<T>(c: &Circle<T>, a: address): bool { c.paid.contains(&a) }

public fun paid_count<T>(c: &Circle<T>): u64 { c.paid.length() }

public fun pot_value<T>(c: &Circle<T>): u64 { c.pot.value() }

public fun total_paid_out<T>(c: &Circle<T>): u64 { c.total_paid_out }

public fun round_deadline_ms<T>(c: &Circle<T>): u64 {
    c.round_started_ms + c.round_duration_ms
}

public fun current_recipient<T>(c: &Circle<T>): address {
    assert!(c.status == STATUS_ACTIVE, ENotActive);
    c.members[c.round]
}

public fun deposit_of<T>(c: &Circle<T>, a: address): u64 {
    if (c.deposits.contains(&a)) c.deposits[&a].value() else 0
}

public fun strikes_of<T>(c: &Circle<T>, a: address): u64 {
    if (c.strikes.contains(&a)) c.strikes[&a] else 0
}

public fun status_open(): u8 { STATUS_OPEN }

public fun status_active(): u8 { STATUS_ACTIVE }

public fun status_complete(): u8 { STATUS_COMPLETE }

public fun status_cancelled(): u8 { STATUS_CANCELLED }

// === Test helpers ===

#[test_only]
public fun start_for_testing<T>(
    circle: &mut Circle<T>,
    r: &Random,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    start(circle, r, clock, ctx);
}
