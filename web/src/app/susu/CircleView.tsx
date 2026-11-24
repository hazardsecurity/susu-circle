"use client";

import { useCurrentAccount, useCurrentClient } from "@mysten/dapp-kit-react";
import { useEffect, useRef, useState } from "react";
import {
  COIN_SYMBOL,
  STATUS,
  explainError,
  fetchCircle,
  fmt,
  fmtDuration,
  short,
  txCancel,
  txContribute,
  txJoin,
  txLeave,
  txPayout,
  txStart,
  txWithdraw,
  type Circle,
} from "@/lib/susu";
import type { RunTx } from "./App";
import { Campfire, type Pending } from "./Campfire";
import { DEMO_CIRCLE } from "./demo";

const STATUS_LABEL = ["Gathering members", "Fire's going", "Complete", "Cancelled"];

export function CircleView(props: {
  id: string;
  busy: boolean;
  run: RunTx;
  version: number;
  onBack: () => void;
}) {
  const client = useCurrentClient();
  const account = useCurrentAccount();
  const isDemo = props.id === "demo";

  const [circle, setCircle] = useState<Circle | null>(isDemo ? DEMO_CIRCLE : null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (isDemo) return;
    let alive = true;
    const load = () =>
      fetchCircle(client, props.id).then(
        (c) => {
          if (!alive) return;
          setCircle(c);
          setError(null);
        },
        (e) => alive && setError(explainError(e)),
      );
    load();
    const poll = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(poll);
    };
  }, [client, props.id, isDemo, props.version]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    const pending = timers.current;
    return () => {
      clearInterval(t);
      pending.forEach(clearTimeout);
    };
  }, []);

  if (error) {
    return (
      <section className="empty-state">
        <h1>We couldn&apos;t find that circle</h1>
        <p>{error} Check the invite link, or go back to all circles.</p>
        <button className="btn btn-ghost" onClick={props.onBack}>
          Back to all circles
        </button>
      </section>
    );
  }
  if (!circle) return <p className="quiet loading">Finding the fire…</p>;

  const me = isDemo ? circle.members[1] : account?.address;
  const isMember = !!me && circle.members.includes(me);
  const isCreator = me === circle.creator;
  const hasPaid = !!me && circle.paid.includes(me);
  const deadline = circle.roundStartedMs + circle.roundDurationMs;
  const allPaid = circle.paid.length === circle.members.length;
  const canPayout = circle.status === STATUS.ACTIVE && (allPaid || now >= deadline);
  const recipient = circle.status === STATUS.ACTIVE ? circle.members[circle.round] : null;
  const myDeposit = me ? (circle.deposits[me] ?? 0n) : 0n;
  const disabled = props.busy || isDemo || !account;
  const fullPot = circle.contribution * BigInt(circle.members.length);
  const who = (a: string) => (a === me ? "You" : short(a));

  async function act(kind: NonNullable<Pending>["kind"] | null, tx: Parameters<RunTx>[0], msg: string) {
    setPending(kind ? { kind, member: me } : null);
    try {
      await props.run(tx, msg);
    } finally {
      setPending(null);
    }
  }

  async function copyLink() {
    const url = new URL(window.location.href);
    url.searchParams.set("circle", circle!.id);
    await navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  // Sample circle only: play out the rest of the round locally.
  function playRound() {
    if (!circle || circle.status !== STATUS.ACTIVE) return;
    setPlaying(true);
    const unpaid = circle.members.filter((m) => !circle.paid.includes(m));
    const step = 750;
    unpaid.forEach((m, k) => {
      timers.current.push(
        window.setTimeout(
          () => setCircle((c) => c && { ...c, paid: [...c.paid, m], pot: c.pot + c.contribution }),
          step * (k + 1),
        ),
      );
    });
    timers.current.push(
      window.setTimeout(
        () => {
          setCircle((c) => {
            if (!c) return c;
            const round = c.round + 1;
            const done = round === c.members.length;
            return {
              ...c,
              round,
              paid: [],
              pot: 0n,
              totalPaidOut: c.totalPaidOut + c.pot,
              status: done ? STATUS.COMPLETE : STATUS.ACTIVE,
              roundStartedMs: Date.now(),
            };
          });
          setPlaying(false);
        },
        step * (unpaid.length + 1) + 500,
      ),
    );
  }

  return (
    <article className="circle">
      <button className="back" onClick={props.onBack}>
        All circles
      </button>

      <header className="circle-head">
        <div>
          <h1>{circle.name}</h1>
          <p className="circle-sub">
            <span className={`status status-${circle.status}`}>{STATUS_LABEL[circle.status]}</span>
            {circle.status === STATUS.ACTIVE && (
              <span>
                Round {circle.round + 1} of {circle.members.length}
              </span>
            )}
          </p>
        </div>
        {!isDemo && (
          <button className="btn btn-ghost" onClick={copyLink}>
            {copied ? "Invite link copied" : "Copy invite link"}
          </button>
        )}
      </header>

      <Campfire circle={circle} me={me} pending={pending} />

      {isDemo && (
        <div className="demo-bar">
          <p>
            This is a sample circle. Play a round to see the fire grow as members pay and the pot go
            to the yeti whose turn it is.
          </p>
          {circle.status === STATUS.ACTIVE ? (
            <button className="btn btn-brand" onClick={playRound} disabled={playing}>
              {playing ? "Playing…" : "Play the rest of this round"}
            </button>
          ) : (
            <button className="btn btn-ghost" onClick={() => setCircle(DEMO_CIRCLE)}>
              Start the sample over
            </button>
          )}
        </div>
      )}

      <div className="circle-grid">
        <section className="round-panel" aria-labelledby="round-h">
          <h2 id="round-h">
            {circle.status === STATUS.OPEN
              ? "Waiting for everyone to sit down"
              : circle.status === STATUS.ACTIVE
                ? `${who(recipient!)} ${recipient === me ? "collect" : "collects"} this round`
                : circle.status === STATUS.COMPLETE
                  ? "Everyone has had their turn"
                  : "This circle was cancelled"}
          </h2>

          {circle.status === STATUS.OPEN && (
            <p className="lede">
              {circle.members.length} of {circle.maxMembers} seats taken. Each member locks a{" "}
              {fmt(circle.deposit)} {COIN_SYMBOL} deposit to sit down. The creator lights the fire when
              everyone&apos;s here, and the order is drawn at random.
            </p>
          )}
          {circle.status === STATUS.ACTIVE && (
            <p className="lede">
              {circle.paid.length} of {circle.members.length} have paid.{" "}
              {now >= deadline
                ? "The round is over. Anyone can pass the pot now; anyone who didn't pay is covered from their deposit."
                : allPaid
                  ? "Everyone's in. Pass the pot whenever you're ready."
                  : `Round ends in ${countdown(deadline - now)}.`}
            </p>
          )}
          {circle.status === STATUS.COMPLETE && (
            <p className="lede">
              {fmt(circle.totalPaidOut)} {COIN_SYMBOL} went around the fire. Members can take back what&apos;s
              left of their deposit.
            </p>
          )}

          <div className="actions">
            {circle.status === STATUS.OPEN && (
              <>
                {!isMember && (
                  <button
                    className="btn btn-brand"
                    disabled={disabled || circle.members.length >= circle.maxMembers}
                    onClick={() => act("join", txJoin(circle), `You took a seat in ${circle.name}.`)}
                  >
                    {circle.members.length >= circle.maxMembers
                      ? "Every seat is taken"
                      : `Take a seat (lock ${fmt(circle.deposit)} ${COIN_SYMBOL})`}
                  </button>
                )}
                {isCreator && (
                  <>
                    <button
                      className="btn btn-brand"
                      disabled={disabled || circle.members.length < 2}
                      onClick={() => act("start", txStart(circle), "The fire's lit and the order is drawn.")}
                    >
                      {circle.members.length < 2 ? "Waiting for a second member" : "Light the fire"}
                    </button>
                    <button
                      className="btn btn-ghost"
                      disabled={disabled}
                      onClick={() => act(null, txCancel(circle), "Circle cancelled. Every deposit was refunded.")}
                    >
                      Cancel and refund everyone
                    </button>
                  </>
                )}
                {isMember && !isCreator && (
                  <button
                    className="btn btn-ghost"
                    disabled={disabled}
                    onClick={() => act(null, txLeave(circle), "You left. Your deposit is back in your wallet.")}
                  >
                    Leave and take my deposit back
                  </button>
                )}
              </>
            )}

            {circle.status === STATUS.ACTIVE && !isDemo && (
              <>
                {isMember && (
                  <button
                    className="btn btn-brand"
                    disabled={disabled || hasPaid}
                    onClick={() =>
                      act(
                        "pay",
                        txContribute(circle),
                        `You added ${fmt(circle.contribution)} ${COIN_SYMBOL} to the fire.`,
                      )
                    }
                  >
                    {hasPaid
                      ? "You've paid this round"
                      : `Add ${fmt(circle.contribution)} ${COIN_SYMBOL} to the fire`}
                  </button>
                )}
                <button
                  className="btn btn-ghost"
                  disabled={disabled || !canPayout}
                  onClick={() => act("payout", txPayout(circle), `The pot went to ${short(recipient!)}.`)}
                >
                  Pass the pot to {who(recipient!)}
                </button>
              </>
            )}

            {circle.status === STATUS.COMPLETE && isMember && !isDemo && (
              <button
                className="btn btn-brand"
                disabled={disabled || !(me! in circle.deposits)}
                onClick={() => act(null, txWithdraw(circle), "Your deposit is back in your wallet.")}
              >
                {me! in circle.deposits
                  ? `Take back my ${fmt(myDeposit)} ${COIN_SYMBOL} deposit`
                  : "Deposit already taken back"}
              </button>
            )}
          </div>
          {pending && (
            <p className="quiet pending-note" role="status">
              Confirm in your wallet. The scene updates once the network accepts it.
            </p>
          )}
          {!account && !isDemo && <p className="quiet">Connect a wallet to take part.</p>}

          <dl className="facts">
            <div>
              <dt>Each round</dt>
              <dd>
                {fmt(circle.contribution)} {COIN_SYMBOL}
              </dd>
            </div>
            <div>
              <dt>Pot per round</dt>
              <dd>
                {fmt(fullPot)} {COIN_SYMBOL}
              </dd>
            </div>
            <div>
              <dt>Deposit</dt>
              <dd>
                {fmt(circle.deposit)} {COIN_SYMBOL}
              </dd>
            </div>
            <div>
              <dt>Round length</dt>
              <dd>{fmtDuration(circle.roundDurationMs)}</dd>
            </div>
          </dl>
        </section>

        <section className="members" aria-labelledby="members-h">
          <h2 id="members-h">{circle.status === STATUS.OPEN ? "Around the fire so far" : "Whose turn, in order"}</h2>
          <ol>
            {circle.members.map((m, i) => {
              const strikes = circle.strikes[m] ?? 0;
              const started = circle.status !== STATUS.OPEN;
              const collected = started && (i < circle.round || circle.status === STATUS.COMPLETE);
              const now_ = m === recipient;
              let state = "";
              if (!started) state = m === circle.creator ? "Lit the circle" : "Seated";
              else if (collected) state = "Collected";
              else if (now_) state = circle.paid.includes(m) ? "Collecting, paid" : "Collecting";
              else if (circle.status === STATUS.ACTIVE) state = circle.paid.includes(m) ? "Paid" : "Not paid yet";
              return (
                <li key={m} className={now_ ? "member member-now" : "member"}>
                  {started && <span className="member-order">{i + 1}</span>}
                  <span className="member-name">
                    {short(m)}
                    {m === me && <em>you</em>}
                  </span>
                  <span className={`member-state ${state.startsWith("Paid") || state === "Collecting, paid" ? "is-paid" : ""}`}>
                    {state}
                    {strikes > 0 && <span className="strike">, missed {strikes}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </article>
  );
}

function countdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m ${sec.toString().padStart(2, "0")}s`;
}
