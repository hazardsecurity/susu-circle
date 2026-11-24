import { COIN_SYMBOL, STATUS, fmt, type Circle } from "@/lib/susu";

const SIZE = 400;
const C = SIZE / 2;
const R = 148;

/**
 * The circle drawn as a circle: one seat per member, in payout order,
 * clockwise from the top. The pot sits in the middle and a line points to
 * whoever collects this round.
 */
export function Ring({ circle, me }: { circle: Circle; me?: string }) {
  const open = circle.status === STATUS.OPEN;
  const active = circle.status === STATUS.ACTIVE;
  const seats = open ? circle.maxMembers : circle.members.length;

  const pos = (i: number, r = R) => {
    const a = (i / seats) * Math.PI * 2 - Math.PI / 2;
    return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
  };

  const recipientIdx = active ? circle.round : -1;
  const target = recipientIdx >= 0 ? pos(recipientIdx, R - 34) : null;

  let center: { big: string; small: string };
  if (open) {
    center = { big: `${circle.members.length}/${circle.maxMembers}`, small: "seats taken" };
  } else if (active) {
    center = { big: fmt(circle.pot), small: `${COIN_SYMBOL} in the pot` };
  } else if (circle.status === STATUS.COMPLETE) {
    center = { big: fmt(circle.totalPaidOut), small: `${COIN_SYMBOL} paid out` };
  } else {
    center = { big: "—", small: "cancelled" };
  }

  const label = open
    ? `${circle.members.length} of ${circle.maxMembers} seats taken`
    : active
      ? `Round ${circle.round + 1}: ${circle.paid.length} of ${seats} paid, pot ${fmt(circle.pot)} ${COIN_SYMBOL}`
      : center.small;

  return (
    <figure className="wheel">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={label}>
        <circle cx={C} cy={C} r={R} className="ring-track" />

        {target && (
          <line x1={C} y1={C} x2={target.x} y2={target.y} className="ring-pointer" />
        )}

        {Array.from({ length: seats }, (_, i) => {
          const member = circle.members[i];
          const { x, y } = pos(i);
          let cls = "seat seat-empty";
          if (member) {
            if (open) cls = "seat seat-taken";
            else if (i === recipientIdx) cls = "seat seat-now";
            else if (i < circle.round || circle.status === STATUS.COMPLETE) cls = "seat seat-done";
            else if (circle.paid.includes(member)) cls = "seat seat-paid";
            else cls = "seat seat-due";
          }
          const r = i === recipientIdx ? 27 : 20;
          const lbl = pos(i, R + 42);
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={r} className={cls} />
              {!open && member && (
                <text x={x} y={y} className="seat-num" dominantBaseline="central" textAnchor="middle">
                  {i + 1}
                </text>
              )}
              {member && member === me && (
                <text x={lbl.x} y={lbl.y} className="seat-you" dominantBaseline="central" textAnchor="middle">
                  you
                </text>
              )}
            </g>
          );
        })}

        <circle cx={C} cy={C} r={70} className="pot" />
        <text x={C} y={C - 8} className="pot-big" textAnchor="middle" dominantBaseline="central">
          {center.big}
        </text>
        <text x={C} y={C + 24} className="pot-small" textAnchor="middle" dominantBaseline="central">
          {center.small}
        </text>
      </svg>
      {!open && (
        <figcaption className="legend">
          <span><i className="key key-now" /> Collecting</span>
          <span><i className="key key-paid" /> Paid</span>
          <span><i className="key key-due" /> Not paid yet</span>
          <span><i className="key key-done" /> Already collected</span>
        </figcaption>
      )}
    </figure>
  );
}
