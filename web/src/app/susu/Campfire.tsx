"use client";

import { useState } from "react";
import { COIN_SYMBOL, STATUS, fmt, type Circle } from "@/lib/susu";

/*
  The circle as a campfire scene. Members are yetis seated around the fire in
  payout order (clockwise from the back).

  Motion, each tied to something that happened:
  - first load: the fire lights, then yetis pop in one by one
  - someone pays: a coin flies from their yeti into the fire, the fire flares
  - someone joins: a yeti rises out of an empty stump
  - the circle starts: yetis walk to their shuffled seats, the fire roars up
  - the pot is passed: a pouch arcs to the collector, who jumps
  - while a wallet request is open: the coin bobs above your yeti
  Ambient: yetis breathe and blink, sparks rise from the fire.
*/

const W = 640;
const H = 380;
const FIRE = { x: W / 2, y: 228 };
const ORBIT = { rx: 230, ry: 92 };

type SeatState = "empty" | "waiting" | "unpaid" | "paid" | "collecting" | "collected";
type Anim = { kind: "hop" | "rise" | "cheer"; n: number };
export type Pending = { kind: "pay" | "payout" | "join" | "start"; member?: string } | null;

function seatPos(i: number, n: number) {
  const a = (i / n) * Math.PI * 2 - Math.PI / 2;
  const x = FIRE.x + ORBIT.rx * Math.cos(a);
  const y = FIRE.y + ORBIT.ry * Math.sin(a);
  const depth = (Math.sin(a) + 1) / 2;
  return { x, y, scale: 0.78 + depth * 0.36 };
}

type Snapshot = { round: number; status: number; paid: string[]; members: string[] };
const snap = (c: Circle): Snapshot => ({ round: c.round, status: c.status, paid: c.paid, members: c.members });

export function Campfire({
  circle,
  me,
  compact = false,
  pending = null,
}: {
  circle: Circle;
  me?: string;
  compact?: boolean;
  pending?: Pending;
}) {
  const open = circle.status === STATUS.OPEN;
  const active = circle.status === STATUS.ACTIVE;
  const complete = circle.status === STATUS.COMPLETE;
  const cancelled = circle.status === STATUS.CANCELLED;
  const n = open ? circle.maxMembers : Math.max(circle.members.length, 1);

  const paidFraction = active ? circle.paid.length / circle.members.length : 0;
  const fire = open ? 0.35 : active ? 0.5 + paidFraction * 0.75 : complete ? 0.22 : 0;

  // --- React to changes since the last render ---
  const [prev, setPrev] = useState<Snapshot>(() => snap(circle));
  const [anims, setAnims] = useState<Record<string, Anim>>({});
  const [coins, setCoins] = useState<{ id: string; member: string }[]>([]);
  const [pouch, setPouch] = useState<{ id: string; seat: number; member: string } | null>(null);
  const [flare, setFlare] = useState(0);
  const [ignite, setIgnite] = useState(0);

  const now = snap(circle);
  if (now.round !== prev.round || now.status !== prev.status || now.paid !== prev.paid || now.members !== prev.members) {
    const bump = (m: string, kind: Anim["kind"], next: Record<string, Anim>) => {
      next[m] = { kind, n: (next[m]?.n ?? 0) + 1 };
    };
    const nextAnims = { ...anims };
    // New payers: coin to the fire, little hop.
    const newPaid = now.paid.filter((m) => !prev.paid.includes(m));
    if (newPaid.length && now.round === prev.round) {
      setCoins((c) => [...c, ...newPaid.map((m) => ({ id: `${m}-r${now.round}`, member: m }))]);
      newPaid.forEach((m) => bump(m, "hop", nextAnims));
    }
    // New members: rise from the stump.
    now.members.filter((m) => !prev.members.includes(m)).forEach((m) => bump(m, "rise", nextAnims));
    // Started: fire roars up (seats glide to shuffled places on their own).
    if (prev.status === STATUS.OPEN && now.status === STATUS.ACTIVE) setIgnite((v) => v + 1);
    // Round settled: pouch to the collector.
    if (now.round > prev.round && prev.status === STATUS.ACTIVE) {
      const seat = prev.round;
      const member = now.members[seat];
      if (member) setPouch({ id: `pouch-${seat}`, seat, member });
    }
    setAnims(nextAnims);
    setPrev(now);
  }

  const seats = Array.from({ length: n }, (_, i) => {
    const member = circle.members[i];
    let state: SeatState = "empty";
    if (member) {
      if (open) state = "waiting";
      else if (complete || i < circle.round) state = "collected";
      else if (active && i === circle.round) state = "collecting";
      else if (circle.paid.includes(member)) state = "paid";
      else state = "unpaid";
    }
    return { i, key: member ?? `empty-${i}`, member, state, ...seatPos(i, n) };
  });
  // Stable paint order so seats keep their DOM node (and can glide) when the order shuffles.
  const painted = [...seats].sort((a, b) => (a.key < b.key ? -1 : 1));
  const posOf = (m: string) => {
    const i = circle.members.indexOf(m);
    return i >= 0 ? seatPos(i, n) : null;
  };

  const firstEmpty = seats.find((s) => s.state === "empty");

  const label = open
    ? `${circle.members.length} of ${circle.maxMembers} seats taken around the fire`
    : active
      ? `Round ${circle.round + 1}: ${circle.paid.length} of ${circle.members.length} paid, ${fmt(circle.pot)} ${COIN_SYMBOL} in the pot`
      : complete
        ? "Every member has collected"
        : "This circle was cancelled";

  const pendingSeat = pending?.kind === "pay" && pending.member ? posOf(pending.member) : null;

  return (
    <div className={compact ? "scene scene-compact" : "scene"}>
      <Sky />
      <svg viewBox={`0 0 ${W} ${H}`} className="scene-svg" role="img" aria-label={label}>
        <defs>
          <radialGradient id="glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffb357" stopOpacity="0.55" />
            <stop offset="45%" stopColor="#ff8a3d" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#ff8a3d" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="seatglow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffc857" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#ffc857" stopOpacity="0" />
          </radialGradient>
        </defs>

        <Pines />
        <ellipse cx={FIRE.x} cy={FIRE.y + 30} rx={W * 0.62} ry={120} className="ground" />
        <ellipse
          cx={FIRE.x}
          cy={FIRE.y + 6}
          rx={150 + fire * 130}
          ry={60 + fire * 44}
          fill="url(#glow)"
          className={pending?.kind === "payout" ? "fire-light fire-eager" : "fire-light"}
        />

        <Fire size={fire} lit={!cancelled} ignite={ignite} flare={flare} eager={pending?.kind === "payout"} />

        {painted.map((s) => (
          <g
            key={s.key}
            className="seat-pos"
            style={{ transform: `translate(${s.x}px, ${s.y}px) scale(${s.state === "collecting" ? s.scale * 1.14 : s.scale})` }}
          >
            {s.state === "empty" ? (
              <Stump wiggle={pending?.kind === "join" && firstEmpty?.i === s.i} />
            ) : (
              <SeatBody
                s={s}
                me={me}
                showOrder={!open}
                anim={s.member ? anims[s.member] : undefined}
                introDelay={s.i}
              />
            )}
          </g>
        ))}

        {pendingSeat && (
          <g style={{ transform: `translate(${pendingSeat.x}px, ${pendingSeat.y - 78 * pendingSeat.scale}px)` }}>
            <g className="coin-hold">
              <Coin />
            </g>
          </g>
        )}

        {coins.map((c) => {
          const p = posOf(c.member);
          if (!p) return null;
          return (
            <g
              key={c.id}
              className="fly-x"
              style={
                {
                  "--sx": `${p.x}px`,
                  "--sy": `${p.y - 60 * p.scale}px`,
                  "--mx": `${(p.x + FIRE.x) / 2}px`,
                  "--my": `${Math.min(p.y, FIRE.y) - 110}px`,
                  "--fx": `${FIRE.x}px`,
                  "--fy": `${FIRE.y - 24}px`,
                } as React.CSSProperties
              }
              onAnimationEnd={(e) => {
                if (e.target !== e.currentTarget) return;
                setCoins((cs) => cs.filter((x) => x.id !== c.id));
                setFlare((f) => f + 1);
              }}
            >
              <g className="fly-y">
                <Coin />
              </g>
            </g>
          );
        })}

        {pouch &&
          (() => {
            const p = seatPos(pouch.seat, n);
            return (
              <g
                key={pouch.id}
                className="fly-x fly-pouch"
                style={
                  {
                    "--sx": `${FIRE.x}px`,
                    "--sy": `${FIRE.y - 30}px`,
                    "--mx": `${(p.x + FIRE.x) / 2}px`,
                    "--my": `${Math.min(p.y, FIRE.y) - 140}px`,
                    "--fx": `${p.x}px`,
                    "--fy": `${p.y - 70 * p.scale}px`,
                  } as React.CSSProperties
                }
                onAnimationEnd={(e) => {
                  if (e.target !== e.currentTarget) return;
                  setAnims((a) => ({ ...a, [pouch.member]: { kind: "cheer", n: (a[pouch.member]?.n ?? 0) + 1 } }));
                  setPouch(null);
                }}
              >
                <g className="fly-y">
                  <BigPouch />
                </g>
              </g>
            );
          })()}
      </svg>

      {!compact && (
        <div className="pot-readout" aria-hidden="true">
          {open ? (
            <>
              <strong key={`m${circle.members.length}`} className="bump">
                {circle.members.length} of {circle.maxMembers}
              </strong>
              seats taken
            </>
          ) : active ? (
            <>
              <strong key={`p${circle.pot}`} className="bump">
                {fmt(circle.pot)} {COIN_SYMBOL}
              </strong>
              in the pot
            </>
          ) : complete ? (
            <>
              <strong>
                {fmt(circle.totalPaidOut)} {COIN_SYMBOL}
              </strong>
              passed around
            </>
          ) : (
            <>Fire&apos;s out. This circle was cancelled.</>
          )}
        </div>
      )}
    </div>
  );
}

function SeatBody({
  s,
  me,
  showOrder,
  anim,
  introDelay,
}: {
  s: { i: number; member?: string; state: SeatState };
  me?: string;
  showOrder: boolean;
  anim?: Anim;
  introDelay: number;
}) {
  const isMe = !!me && s.member === me;
  const animClass = anim ? `anim-${anim.kind}` : "anim-intro";
  return (
    <g className={`seat seat-${s.state}`}>
      {s.state === "collecting" && <ellipse cx={0} cy={-26} rx={50} ry={50} fill="url(#seatglow)" className="seat-glow" />}
      <g
        key={anim ? `${anim.kind}-${anim.n}` : "intro"}
        className={`seat-anim ${animClass}`}
        style={{ "--i": introDelay } as React.CSSProperties}
      >
        <Yeti blinkDelay={(introDelay * 1.7) % 5} />
        {s.state === "collected" && <Pouch />}
      </g>
      {anim?.kind === "cheer" && <Sparkles key={`sp-${anim.n}`} />}
      {showOrder && (
        <g transform="translate(0 10)">
          <circle r={9} className="order-badge" />
          <text className="order-num" textAnchor="middle" dominantBaseline="central">
            {s.i + 1}
          </text>
        </g>
      )}
      {isMe && (
        <text y={-64} className="you-tag" textAnchor="middle">
          you
        </text>
      )}
    </g>
  );
}

/** An original yeti: fluffy round body, face patch, little horns. */
function Yeti({ blinkDelay }: { blinkDelay: number }) {
  return (
    <g className="yeti">
      <ellipse cx={0} cy={2} rx={20} ry={5} className="yeti-shadow" />
      <g className="yeti-breathe" style={{ animationDelay: `${-blinkDelay}s` }}>
        <path d="M-11 -46 q-6 -8 -2 -14 q2 6 7 9 z" className="yeti-horn" />
        <path d="M11 -46 q6 -8 2 -14 q-2 6 -7 9 z" className="yeti-horn" />
        <path
          className="yeti-fur"
          d="M-22 0 C-26 -6 -27 -14 -24 -20 C-28 -26 -26 -36 -19 -40 C-18 -48 -9 -53 -2 -51
             C4 -55 14 -51 17 -44 C25 -41 28 -32 24 -25 C28 -18 27 -8 22 0 Z"
        />
        <ellipse cx={-19} cy={-14} rx={6} ry={9} className="yeti-fur" transform="rotate(20 -19 -14)" />
        <ellipse cx={19} cy={-14} rx={6} ry={9} className="yeti-fur" transform="rotate(-20 19 -14)" />
        <ellipse cx={0} cy={-31} rx={12} ry={10} className="yeti-face" />
        <g className="yeti-eyes" style={{ animationDelay: `${blinkDelay}s` }}>
          <circle cx={-4.5} cy={-32} r={1.9} className="yeti-eye" />
          <circle cx={4.5} cy={-32} r={1.9} className="yeti-eye" />
        </g>
        <path d="M-3 -26.5 q3 2.5 6 0" className="yeti-mouth" />
        <ellipse cx={-8} cy={-27.5} rx={2.2} ry={1.3} className="yeti-cheek" />
        <ellipse cx={8} cy={-27.5} rx={2.2} ry={1.3} className="yeti-cheek" />
      </g>
    </g>
  );
}

function Stump({ wiggle }: { wiggle: boolean }) {
  return (
    <g className={wiggle ? "stump stump-wiggle" : "stump"}>
      <ellipse cx={0} cy={-4} rx={18} ry={7} className="stump-top" />
      <rect x={-18} y={-4} width={36} height={14} rx={3} className="stump-side" />
      {wiggle && (
        <text y={-18} textAnchor="middle" className="stump-hint">
          your seat
        </text>
      )}
    </g>
  );
}

function Coin() {
  return (
    <g className="coin">
      <circle r={8} className="coin-face" />
      <circle r={5} className="coin-ring" />
    </g>
  );
}

function Pouch() {
  return (
    <g transform="translate(20 -6)" className="pouch">
      <path d="M-6 0 q-2 -9 3 -11 h6 q5 2 3 11 z" />
      <path d="M-3 -11 l3 -3 l3 3" className="pouch-tie" />
    </g>
  );
}

function BigPouch() {
  return (
    <g className="pouch big-pouch">
      <path d="M-12 8 q-5 -18 6 -22 h12 q11 4 6 22 z" />
      <path d="M-6 -14 l6 -6 l6 6" className="pouch-tie" />
    </g>
  );
}

function Sparkles() {
  return (
    <g className="sparkles">
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <circle key={deg} r={2.6} className="sparkle" style={{ "--a": `${deg}deg` } as React.CSSProperties} />
      ))}
    </g>
  );
}

function Fire({
  size,
  lit,
  ignite,
  flare,
  eager,
}: {
  size: number;
  lit: boolean;
  ignite: number;
  flare: number;
  eager: boolean;
}) {
  return (
    <g transform={`translate(${FIRE.x} ${FIRE.y})`}>
      {[-30, -15, 0, 15, 30].map((x, k) => (
        <ellipse key={k} cx={x} cy={6 - Math.abs(x) * 0.08} rx={9} ry={5} className="stone" />
      ))}
      <rect x={-26} y={-6} width={52} height={9} rx={4.5} className="log" transform="rotate(14)" />
      <rect x={-26} y={-6} width={52} height={9} rx={4.5} className="log log-b" transform="rotate(-14)" />
      {lit && (
        <g className="flames" style={{ transform: `scale(${size})` }}>
          <g key={`ig-${ignite}`} className="fire-intro">
            <g key={`fl-${flare}`} className={flare ? "fire-flare" : undefined}>
              <g className={eager ? "flicker flicker-eager" : "flicker"}>
                <path className="flame-outer" d="M0 0 C-30 -6 -30 -40 -10 -62 C-12 -44 0 -42 2 -70 C20 -52 34 -26 26 -8 C22 -2 12 2 0 0 Z" />
                <path className="flame-mid" d="M0 -2 C-18 -6 -20 -30 -6 -46 C-6 -32 4 -32 6 -52 C18 -38 24 -18 16 -6 C12 -2 6 0 0 -2 Z" />
                <path className="flame-core" d="M0 -4 C-9 -7 -10 -20 -2 -30 C-1 -22 5 -22 6 -32 C12 -24 13 -12 8 -6 C6 -4 3 -3 0 -4 Z" />
              </g>
            </g>
          </g>
          <g className="sparks">
            {[-14, 6, -4, 16, -20, 10].map((x, k) => (
              <circle key={k} cx={x} cy={-40} r={2} className="spark" style={{ animationDelay: `${k * 0.45}s` }} />
            ))}
          </g>
        </g>
      )}
      {flare > 0 && <circle key={`ring-${flare}`} r={30} cy={-24} className="flare-ring" />}
    </g>
  );
}

function Pines() {
  const pines = [
    { x: 30, s: 1.25 },
    { x: 78, s: 0.9 },
    { x: 120, s: 0.7 },
    { x: 520, s: 0.75 },
    { x: 566, s: 1.05 },
    { x: 616, s: 1.3 },
  ];
  return (
    <g className="pines">
      {pines.map((p, k) => (
        <g key={k} transform={`translate(${p.x} 196) scale(${p.s})`}>
          <path d="M0 -110 L-26 -52 H-14 L-34 -8 H-18 L-40 30 H40 L18 -8 H34 L14 -52 H26 Z" />
          <path d="M0 -110 L-10 -88 L0 -92 L10 -88 Z" className="pine-snow" />
        </g>
      ))}
    </g>
  );
}

function Sky() {
  return (
    <div className="sky" aria-hidden="true">
      <span className="moon" />
      {STARS.map((s, k) => (
        <span
          key={k}
          className={s.twinkle ? "star star-twinkle" : "star"}
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.r, height: s.r, animationDelay: `${s.d}s` }}
        />
      ))}
      <div className="snow" />
    </div>
  );
}

const STARS = [
  [6, 10, 2, 1], [14, 26, 1.5, 0], [21, 8, 2.5, 1], [29, 18, 1.5, 0], [37, 6, 2, 1],
  [44, 22, 1.5, 1], [52, 12, 2, 0], [58, 4, 1.5, 1], [63, 24, 2, 1], [71, 9, 1.5, 0],
  [78, 30, 2, 1], [86, 16, 1.5, 1], [93, 7, 2, 0], [9, 38, 1.5, 1], [48, 34, 1.5, 0],
  [67, 40, 1.5, 1], [97, 34, 2, 1], [33, 42, 1.5, 0],
].map(([x, y, r, t], k) => ({ x, y, r, twinkle: t === 1, d: (k % 6) * 0.7 }));
