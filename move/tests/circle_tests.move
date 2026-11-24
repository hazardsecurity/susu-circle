#[test_only, allow(implicit_const_copy)]
module susu::circle_tests;

use std::unit_test::assert_eq;
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::random::{Self, Random};
use sui::sui::SUI;
use sui::test_scenario::{Self as ts, Scenario};
use susu::circle::{Self, Circle};

const ALICE: address = @0xA11CE;
const BOB: address = @0xB0B;
const CAROL: address = @0xCA201;
const DAVE: address = @0xDA7E;

const CONTRIB: u64 = 100;
const DEPOSIT: u64 = 150;
const ROUND_MS: u64 = 1000;

// === Helpers ===

fun setup(): (Scenario, Clock) {
    let mut sc = ts::begin(@0x0);
    random::create_for_testing(sc.ctx());
    sc.next_tx(@0x0);
    let mut r = sc.take_shared<Random>();
    r.update_randomness_state_for_testing(
        0,
        x"1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F",
        sc.ctx(),
    );
    ts::return_shared(r);
    let clock = clock::create_for_testing(sc.ctx());
    (sc, clock)
}

fun mint(sc: &mut Scenario, amount: u64): Coin<SUI> {
    coin::mint_for_testing<SUI>(amount, sc.ctx())
}

/// Alice creates a circle with the given cap.
fun create(sc: &mut Scenario, cap: u64) {
    sc.next_tx(ALICE);
    let dep = mint(sc, DEPOSIT);
    circle::create<SUI>(b"Market Women".to_string(), CONTRIB, cap, ROUND_MS, dep, sc.ctx());
}

fun join(sc: &mut Scenario, who: address) {
    sc.next_tx(who);
    let mut c = sc.take_shared<Circle<SUI>>();
    let dep = mint(sc, DEPOSIT);
    c.join(dep, sc.ctx());
    ts::return_shared(c);
}

fun start(sc: &mut Scenario, who: address, clock: &Clock) {
    sc.next_tx(who);
    let mut c = sc.take_shared<Circle<SUI>>();
    let r = sc.take_shared<Random>();
    c.start_for_testing(&r, clock, sc.ctx());
    ts::return_shared(r);
    ts::return_shared(c);
}

fun contribute(sc: &mut Scenario, who: address) {
    sc.next_tx(who);
    let mut c = sc.take_shared<Circle<SUI>>();
    let pay = mint(sc, CONTRIB);
    c.contribute(pay, sc.ctx());
    ts::return_shared(c);
}

fun payout(sc: &mut Scenario, who: address, clock: &Clock) {
    sc.next_tx(who);
    let mut c = sc.take_shared<Circle<SUI>>();
    c.payout(clock, sc.ctx());
    ts::return_shared(c);
}

fun withdraw(sc: &mut Scenario, who: address) {
    sc.next_tx(who);
    let mut c = sc.take_shared<Circle<SUI>>();
    c.withdraw_deposit(sc.ctx());
    ts::return_shared(c);
}

fun members(sc: &mut Scenario): vector<address> {
    sc.next_tx(@0x0);
    let c = sc.take_shared<Circle<SUI>>();
    let m = c.members();
    ts::return_shared(c);
    m
}

/// Sum of all SUI coins owned by `who`.
fun balance_of(sc: &mut Scenario, who: address): u64 {
    sc.next_tx(who);
    let ids = ts::ids_for_address<Coin<SUI>>(who);
    let mut total = 0;
    ids.do!(|id| {
        let c = sc.take_from_address_by_id<Coin<SUI>>(who, id);
        total = total + c.value();
        ts::return_to_address(who, c);
    });
    total
}

fun finish(sc: Scenario, clock: Clock) {
    clock.destroy_for_testing();
    sc.end();
}

// === Happy path ===

#[test]
fun full_cycle_everyone_pays() {
    let (mut sc, clock) = setup();
    create(&mut sc, 3);
    join(&mut sc, BOB);
    join(&mut sc, CAROL);
    start(&mut sc, ALICE, &clock);

    let order = members(&mut sc);
    assert_eq!(order.length(), 3);
    assert!(order.contains(&ALICE) && order.contains(&BOB) && order.contains(&CAROL));

    let mut round = 0;
    while (round < 3) {
        contribute(&mut sc, ALICE);
        contribute(&mut sc, BOB);
        contribute(&mut sc, CAROL);
        // Anyone can crank the payout once all have paid; no need to wait.
        payout(&mut sc, DAVE, &clock);
        // Recipient got the full pot.
        assert_eq!(balance_of(&mut sc, order[round]), 3 * CONTRIB);
        round = round + 1;
    };

    sc.next_tx(@0x0);
    {
        let c = sc.take_shared<Circle<SUI>>();
        assert_eq!(c.status(), circle::status_complete());
        assert_eq!(c.total_paid_out(), 9 * CONTRIB);
        assert_eq!(c.strikes_of(ALICE), 0);
        ts::return_shared(c);
    };

    withdraw(&mut sc, ALICE);
    withdraw(&mut sc, BOB);
    withdraw(&mut sc, CAROL);
    assert_eq!(balance_of(&mut sc, ALICE), 3 * CONTRIB + DEPOSIT);
    assert_eq!(balance_of(&mut sc, BOB), 3 * CONTRIB + DEPOSIT);
    assert_eq!(balance_of(&mut sc, CAROL), 3 * CONTRIB + DEPOSIT);

    finish(sc, clock);
}

// === Defaults ===

#[test]
fun missed_payment_is_slashed_from_deposit() {
    let (mut sc, mut clock) = setup();
    create(&mut sc, 3);
    join(&mut sc, BOB);
    join(&mut sc, CAROL);
    start(&mut sc, ALICE, &clock);
    let order = members(&mut sc);

    // Round 0: Carol doesn't pay. Wait for the deadline.
    contribute(&mut sc, ALICE);
    contribute(&mut sc, BOB);
    clock.increment_for_testing(ROUND_MS);
    payout(&mut sc, DAVE, &clock);

    // Recipient still receives a full pot, covered by Carol's deposit.
    assert_eq!(balance_of(&mut sc, order[0]), 3 * CONTRIB);

    sc.next_tx(@0x0);
    {
        let c = sc.take_shared<Circle<SUI>>();
        assert_eq!(c.strikes_of(CAROL), 1);
        assert_eq!(c.deposit_of(CAROL), DEPOSIT - CONTRIB);
        assert_eq!(c.deposit_of(BOB), DEPOSIT);
        assert_eq!(c.round(), 1);
        ts::return_shared(c);
    };

    // Round 1: Carol misses again. Only 50 left in her deposit.
    contribute(&mut sc, ALICE);
    contribute(&mut sc, BOB);
    clock.increment_for_testing(ROUND_MS);
    payout(&mut sc, DAVE, &clock);

    sc.next_tx(@0x0);
    {
        let c = sc.take_shared<Circle<SUI>>();
        assert_eq!(c.strikes_of(CAROL), 2);
        assert_eq!(c.deposit_of(CAROL), 0);
        assert_eq!(c.total_paid_out(), 3 * CONTRIB + 2 * CONTRIB + (DEPOSIT - CONTRIB));
        ts::return_shared(c);
    };

    finish(sc, clock);
}

// === Leave / cancel ===

#[test]
fun leave_refunds_deposit() {
    let (mut sc, clock) = setup();
    create(&mut sc, 3);
    join(&mut sc, BOB);

    sc.next_tx(BOB);
    {
        let mut c = sc.take_shared<Circle<SUI>>();
        c.leave(sc.ctx());
        assert_eq!(c.member_count(), 1);
        ts::return_shared(c);
    };
    assert_eq!(balance_of(&mut sc, BOB), DEPOSIT);
    finish(sc, clock);
}

#[test]
fun cancel_refunds_everyone() {
    let (mut sc, clock) = setup();
    create(&mut sc, 3);
    join(&mut sc, BOB);

    sc.next_tx(ALICE);
    {
        let mut c = sc.take_shared<Circle<SUI>>();
        c.cancel(sc.ctx());
        assert_eq!(c.status(), circle::status_cancelled());
        ts::return_shared(c);
    };
    assert_eq!(balance_of(&mut sc, ALICE), DEPOSIT);
    assert_eq!(balance_of(&mut sc, BOB), DEPOSIT);
    finish(sc, clock);
}

#[test]
fun can_start_before_full() {
    let (mut sc, clock) = setup();
    create(&mut sc, 5);
    join(&mut sc, BOB);
    start(&mut sc, ALICE, &clock);
    assert_eq!(members(&mut sc).length(), 2);
    finish(sc, clock);
}

// === Guards ===

#[test, expected_failure(abort_code = circle::EDepositTooSmall)]
fun deposit_must_cover_one_contribution() {
    let (mut sc, clock) = setup();
    sc.next_tx(ALICE);
    let dep = mint(&mut sc, CONTRIB - 1);
    circle::create<SUI>(b"x".to_string(), CONTRIB, 3, ROUND_MS, dep, sc.ctx());
    finish(sc, clock);
}

#[test, expected_failure(abort_code = circle::EWrongDepositAmount)]
fun join_requires_exact_deposit() {
    let (mut sc, clock) = setup();
    create(&mut sc, 3);
    sc.next_tx(BOB);
    let mut c = sc.take_shared<Circle<SUI>>();
    let dep = mint(&mut sc, DEPOSIT + 1);
    c.join(dep, sc.ctx());
    ts::return_shared(c);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = circle::EAlreadyMember)]
fun cannot_join_twice() {
    let (mut sc, clock) = setup();
    create(&mut sc, 3);
    join(&mut sc, BOB);
    join(&mut sc, BOB);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = circle::ECircleFull)]
fun cannot_join_full_circle() {
    let (mut sc, clock) = setup();
    create(&mut sc, 2);
    join(&mut sc, BOB);
    join(&mut sc, CAROL);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = circle::ENotOpen)]
fun cannot_join_after_start() {
    let (mut sc, clock) = setup();
    create(&mut sc, 3);
    join(&mut sc, BOB);
    start(&mut sc, ALICE, &clock);
    join(&mut sc, CAROL);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = circle::ENotCreator)]
fun only_creator_can_start() {
    let (mut sc, clock) = setup();
    create(&mut sc, 3);
    join(&mut sc, BOB);
    start(&mut sc, BOB, &clock);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = circle::ENotEnoughMembers)]
fun cannot_start_alone() {
    let (mut sc, clock) = setup();
    create(&mut sc, 3);
    start(&mut sc, ALICE, &clock);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = circle::EAlreadyPaid)]
fun cannot_pay_twice_in_a_round() {
    let (mut sc, clock) = setup();
    create(&mut sc, 2);
    join(&mut sc, BOB);
    start(&mut sc, ALICE, &clock);
    contribute(&mut sc, BOB);
    contribute(&mut sc, BOB);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = circle::ENotMember)]
fun outsider_cannot_contribute() {
    let (mut sc, clock) = setup();
    create(&mut sc, 2);
    join(&mut sc, BOB);
    start(&mut sc, ALICE, &clock);
    contribute(&mut sc, DAVE);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = circle::ERoundNotReady)]
fun payout_waits_for_payments_or_deadline() {
    let (mut sc, clock) = setup();
    create(&mut sc, 2);
    join(&mut sc, BOB);
    start(&mut sc, ALICE, &clock);
    contribute(&mut sc, BOB);
    payout(&mut sc, BOB, &clock);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = circle::ENotComplete)]
fun cannot_withdraw_deposit_early() {
    let (mut sc, clock) = setup();
    create(&mut sc, 2);
    join(&mut sc, BOB);
    start(&mut sc, ALICE, &clock);
    withdraw(&mut sc, BOB);
    finish(sc, clock);
}

#[test, expected_failure(abort_code = circle::ECreatorCannotLeave)]
fun creator_cannot_leave() {
    let (mut sc, clock) = setup();
    create(&mut sc, 2);
    sc.next_tx(ALICE);
    let mut c = sc.take_shared<Circle<SUI>>();
    c.leave(sc.ctx());
    ts::return_shared(c);
    finish(sc, clock);
}
