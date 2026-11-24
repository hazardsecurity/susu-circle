import type { Circle } from "@/lib/susu";

const a = (n: number) => `0x${n.toString(16).repeat(64).slice(0, 64)}`;
const members = [a(0xa), a(0xb), a(0xc), a(0xd), a(0xe)];
const SUI = 1_000_000_000n;

/** Sample circle shown at ?circle=demo so the app can be explored without a wallet. */
export const DEMO_CIRCLE: Circle = {
  id: "demo",
  name: "Makola traders",
  creator: members[2],
  contribution: SUI / 2n,
  deposit: SUI / 2n,
  maxMembers: 5,
  roundDurationMs: 7 * 24 * 60 * 60_000,
  status: 1,
  members,
  round: 2,
  roundStartedMs: Date.now() - 2 * 24 * 60 * 60_000,
  paid: [members[0], members[1], members[3]],
  pot: (SUI / 2n) * 3n,
  deposits: Object.fromEntries(members.map((m, i) => [m, i === 4 ? 0n : SUI / 2n])),
  strikes: Object.fromEntries(members.map((m, i) => [m, i === 4 ? 1 : 0])),
  totalPaidOut: (SUI / 2n) * 10n,
};

/** Decorative circle for the home page scene. */
const heroMembers = [a(1), a(2), a(3), a(4), a(5), a(6)];
export const HERO_CIRCLE: Circle = {
  ...DEMO_CIRCLE,
  id: "hero",
  members: heroMembers,
  maxMembers: 6,
  round: 2,
  paid: [heroMembers[0], heroMembers[1], heroMembers[3], heroMembers[5]],
  deposits: {},
  strikes: {},
};
