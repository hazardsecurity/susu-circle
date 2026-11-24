import { bcs } from "@mysten/sui/bcs";
import type { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";

export const PACKAGE_ID = process.env.NEXT_PUBLIC_SUSU_PACKAGE_ID ?? "";
export const COIN_TYPE = "0x2::sui::SUI";
export const COIN_SYMBOL = "SUI";
export const COIN_DECIMALS = 9;

const MODULE = "circle";
const CLOCK = "0x6";
const RANDOM = "0x8";

export const STATUS = { OPEN: 0, ACTIVE: 1, COMPLETE: 2, CANCELLED: 3 } as const;

// --- On-chain layouts (must match move/sources/circle.move) ---

const BalanceBcs = bcs.struct("Balance", { value: bcs.u64() });

const CircleBcs = bcs.struct("Circle", {
  id: bcs.Address,
  name: bcs.string(),
  creator: bcs.Address,
  contribution: bcs.u64(),
  deposit: bcs.u64(),
  max_members: bcs.u64(),
  round_duration_ms: bcs.u64(),
  status: bcs.u8(),
  members: bcs.vector(bcs.Address),
  round: bcs.u64(),
  round_started_ms: bcs.u64(),
  paid: bcs.struct("VecSet", { contents: bcs.vector(bcs.Address) }),
  pot: BalanceBcs,
  deposits: bcs.struct("VecMap", {
    contents: bcs.vector(bcs.struct("Entry", { key: bcs.Address, value: BalanceBcs })),
  }),
  strikes: bcs.struct("VecMap", {
    contents: bcs.vector(bcs.struct("Entry", { key: bcs.Address, value: bcs.u64() })),
  }),
  total_paid_out: bcs.u64(),
});

const CircleCreatedBcs = bcs.struct("CircleCreated", {
  circle_id: bcs.Address,
  creator: bcs.Address,
  name: bcs.string(),
  contribution: bcs.u64(),
  deposit: bcs.u64(),
  max_members: bcs.u64(),
  round_duration_ms: bcs.u64(),
});

export type Circle = {
  id: string;
  name: string;
  creator: string;
  contribution: bigint;
  deposit: bigint;
  maxMembers: number;
  roundDurationMs: number;
  status: number;
  members: string[];
  round: number;
  roundStartedMs: number;
  paid: string[];
  pot: bigint;
  deposits: Record<string, bigint>;
  strikes: Record<string, number>;
  totalPaidOut: bigint;
};

export type CircleSummary = {
  id: string;
  name: string;
  creator: string;
  contribution: bigint;
  maxMembers: number;
};

function parseCircle(bytes: Uint8Array): Circle {
  const c = CircleBcs.parse(bytes);
  return {
    id: c.id,
    name: c.name,
    creator: c.creator,
    contribution: BigInt(c.contribution),
    deposit: BigInt(c.deposit),
    maxMembers: Number(c.max_members),
    roundDurationMs: Number(c.round_duration_ms),
    status: c.status,
    members: c.members,
    round: Number(c.round),
    roundStartedMs: Number(c.round_started_ms),
    paid: c.paid.contents,
    pot: BigInt(c.pot.value),
    deposits: Object.fromEntries(c.deposits.contents.map((e) => [e.key, BigInt(e.value.value)])),
    strikes: Object.fromEntries(c.strikes.contents.map((e) => [e.key, Number(e.value)])),
    totalPaidOut: BigInt(c.total_paid_out),
  };
}

// --- Reads ---

export async function fetchCircle(client: SuiGrpcClient, id: string): Promise<Circle> {
  const { object } = await client.getObject({ objectId: id, include: { content: true } });
  if (!object.content) throw new Error("This circle could not be read.");
  return parseCircle(object.content);
}

/** Most recent circles, newest first, found through their creation events. */
export async function fetchRecentCircles(client: SuiGrpcClient, limit = 25): Promise<CircleSummary[]> {
  const page = await client.listEvents({
    filter: { eventType: `${PACKAGE_ID}::${MODULE}::CircleCreated` },
    order: "descending",
    limit,
  });
  return page.events.map((e) => {
    const ev = CircleCreatedBcs.parse(e.bcs);
    return {
      id: ev.circle_id,
      name: ev.name,
      creator: ev.creator,
      contribution: BigInt(ev.contribution),
      maxMembers: Number(ev.max_members),
    };
  });
}

// --- Transactions ---

const target = (fn: string) => `${PACKAGE_ID}::${MODULE}::${fn}`;

export function txCreate(args: {
  name: string;
  contribution: bigint;
  deposit: bigint;
  maxMembers: number;
  roundDurationMs: number;
}) {
  const tx = new Transaction();
  tx.moveCall({
    target: target("create"),
    typeArguments: [COIN_TYPE],
    arguments: [
      tx.pure.string(args.name),
      tx.pure.u64(args.contribution),
      tx.pure.u64(args.maxMembers),
      tx.pure.u64(args.roundDurationMs),
      tx.coin({ balance: args.deposit, type: COIN_TYPE }),
    ],
  });
  return tx;
}

export function txJoin(c: Circle) {
  const tx = new Transaction();
  tx.moveCall({
    target: target("join"),
    typeArguments: [COIN_TYPE],
    arguments: [tx.object(c.id), tx.coin({ balance: c.deposit, type: COIN_TYPE })],
  });
  return tx;
}

export function txContribute(c: Circle) {
  const tx = new Transaction();
  tx.moveCall({
    target: target("contribute"),
    typeArguments: [COIN_TYPE],
    arguments: [tx.object(c.id), tx.coin({ balance: c.contribution, type: COIN_TYPE })],
  });
  return tx;
}

export function txStart(c: Circle) {
  const tx = new Transaction();
  tx.moveCall({
    target: target("start"),
    typeArguments: [COIN_TYPE],
    arguments: [tx.object(c.id), tx.object(RANDOM), tx.object(CLOCK)],
  });
  return tx;
}

export function txPayout(c: Circle) {
  const tx = new Transaction();
  tx.moveCall({
    target: target("payout"),
    typeArguments: [COIN_TYPE],
    arguments: [tx.object(c.id), tx.object(CLOCK)],
  });
  return tx;
}

function simple(fn: "leave" | "cancel" | "withdraw_deposit") {
  return (c: Circle) => {
    const tx = new Transaction();
    tx.moveCall({ target: target(fn), typeArguments: [COIN_TYPE], arguments: [tx.object(c.id)] });
    return tx;
  };
}
export const txLeave = simple("leave");
export const txCancel = simple("cancel");
export const txWithdraw = simple("withdraw_deposit");

// --- Formatting ---

export function toBase(amount: string): bigint {
  const [whole, frac = ""] = amount.trim().split(".");
  const f = (frac + "0".repeat(COIN_DECIMALS)).slice(0, COIN_DECIMALS);
  return BigInt(whole || "0") * 10n ** BigInt(COIN_DECIMALS) + BigInt(f || "0");
}

export function fmt(amount: bigint): string {
  const base = 10n ** BigInt(COIN_DECIMALS);
  const whole = amount / base;
  const frac = (amount % base).toString().padStart(COIN_DECIMALS, "0").replace(/0+$/, "").slice(0, 4);
  return frac ? `${whole}.${frac}` : whole.toString();
}

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function fmtDuration(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hr`;
  return `${Math.round(h / 24)} days`;
}

/** Human message for a Move abort code from circle.move. */
const ERRORS: Record<number, string> = {
  0: "Contribution must be more than zero.",
  1: "A circle needs between 2 and 20 members.",
  2: "Round length must be more than zero.",
  3: "The deposit must be at least one contribution.",
  4: "The deposit doesn't match this circle's deposit.",
  5: "This circle is no longer open to joining.",
  6: "This circle isn't running.",
  7: "Deposits can be withdrawn once the circle completes.",
  8: "This circle is full.",
  9: "You're already in this circle.",
  10: "You're not a member of this circle.",
  11: "Only the circle's creator can do that.",
  12: "A circle needs at least 2 members to start.",
  13: "The contribution amount doesn't match.",
  14: "You've already paid this round.",
  15: "The payout opens when everyone has paid or the round ends.",
  16: "The creator can't leave. Cancel the circle instead.",
  17: "You have no deposit left to withdraw.",
};

export function explainError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.match(/MoveAbort[\s\S]*?(\d+)\)?\s*(?:in command|$)/) ?? msg.match(/abort code:?\s*(\d+)/i);
  if (m && ERRORS[Number(m[1])]) return ERRORS[Number(m[1])];
  if (/rejected|denied|cancel/i.test(msg)) return "You declined the request in your wallet.";
  if (/insufficient|balance/i.test(msg)) return `Not enough ${COIN_SYMBOL} in your wallet for this.`;
  return msg;
}
