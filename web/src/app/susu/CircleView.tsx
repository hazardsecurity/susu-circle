"use client";

import { useCurrentAccount, useCurrentClient } from "@mysten/dapp-kit-react";
import { useEffect, useState } from "react";
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
import { DEMO_CIRCLE } from "./demo";
import { Ring } from "./Ring";

const STATUS_LABEL = ["Open for members", "Running", "Complete", "Cancelled"];

export function CircleView(props: { id: string; busy: boolean; run: RunTx; version: number }) {
  const client = useCurrentClient();
  const account = useCurrentAccount();
  const isDemo = props.id === "demo";

  const [circle, setCircle] = useState<Circle | null>(isDemo ? DEMO_CIRCLE : null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);

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
    return () => clearInterval(t);
  }, []);

  if (error) {
    return (
      <div className="intro">
        <h1>Circle not found</h1>
        <p>{error} Check the link, or pick a circle from the list.</p>
      </div>
    );
  }
  if (!circle) return <p className="quiet">Loading circle…</p>;

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

  async function copyLink() {
    const url = new URL(window.location.href);
    url.searchParams.set("circle", circle!.id);
    await navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <article className="circle">
      <header className="circle-head">
        <div>
          <h1>{circle.name}</h1>
          <p className="sub">
            <span className={`status status-${circle.status}`}>{STATUS_LABEL[circle.status]}</span>
            {circle.status === STATUS.ACTIVE && (
              <> Round {circle.round + 1} of {circle.members.length}</>
            )}
          </p>
        </div>
        <button className="btn btn-quiet" onClick={copyLink}>
          {copied ? "Link copied" : "Copy invite link"}
        </button>
      </header>

      {isDemo && (
        <p className="demo-note">
          This is sample data showing a circle mid-way through. Connect a wallet and open a real circle
          to try it on testnet.
        </p>
      )}

      <div className="circle-body">
        <Ring circle={circle} me={me} />

        <div className="panel">
          <dl className="facts">
            <div>
              <dt>Each round</dt>
              <dd>
                {fmt(circle.contribution)} {COIN_SYMBOL}
              </dd>
            </div>
            <div>
              <dt>Full pot</dt>
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

          {circle.status === STATUS.ACTIVE && (
            <div className="round-box">
              <p>
                <strong>{recipient === me ? "You collect" : `${short(recipient!)} collects`}</strong> this
                round. {circle.paid.length} of {circle.members.length} have paid.
              </p>
              <p className="quiet">
                {now >= deadline
                  ? "The round has ended. Anyone can release the pot; unpaid members are covered from their deposit."
                  : `Round ends in ${countdown(deadline - now)}.`}
              </p>
            </div>
          )}

          <div className="actions">
            {circle.status === STATUS.OPEN && (
              <>
                {!isMember && (
                  <button
                    className="btn btn-primary"
                    disabled={disabled || circle.members.length >= circle.maxMembers}
                    onClick={() => props.run(txJoin(circle), `You joined ${circle.name}.`)}
                  >
                    {circle.members.length >= circle.maxMembers
                      ? "Circle is full"
                      : `Join and lock ${fmt(circle.deposit)} ${COIN_SYMBOL}`}
                  </button>
                )}
                {isCreator && (
                  <>
                    <button
                      className="btn btn-primary"
                      disabled={disabled || circle.members.length < 2}
                      onClick={() => props.run(txStart(circle), "Circle started. The payout order is set.")}
                    >
                      {circle.members.length < 2 ? "Waiting for a second member" : "Start the circle"}
                    </button>
                    <button
                      className="btn btn-quiet"
                      disabled={disabled}
                      onClick={() => props.run(txCancel(circle), "Circle cancelled. Deposits refunded.")}
                    >
                      Cancel and refund
                    </button>
                  </>
                )}
                {isMember && !isCreator && (
                  <button
                    className="btn btn-quiet"
                    disabled={disabled}
                    onClick={() => props.run(txLeave(circle), "You left. Your deposit is back.")}
                  >
                    Leave and get deposit back
                  </button>
                )}
              </>
            )}

            {circle.status === STATUS.ACTIVE && (
              <>
                {isMember && (
                  <button
                    className="btn btn-primary"
                    disabled={disabled || hasPaid}
                    onClick={() =>
                      props.run(txContribute(circle), `Paid ${fmt(circle.contribution)} ${COIN_SYMBOL} for this round.`)
                    }
                  >
                    {hasPaid ? "You've paid this round" : `Pay ${fmt(circle.contribution)} ${COIN_SYMBOL}`}
                  </button>
                )}
                <button
                  className="btn btn-gold"
                  disabled={disabled || !canPayout}
                  onClick={() => props.run(txPayout(circle), `Pot released to ${short(recipient!)}.`)}
                >
                  Release the pot
                </button>
              </>
            )}

            {circle.status === STATUS.COMPLETE && isMember && (
              <button
                className="btn btn-primary"
                disabled={disabled || !(me! in circle.deposits)}
                onClick={() => props.run(txWithdraw(circle), "Deposit withdrawn.")}
              >
                {me! in circle.deposits ? `Withdraw ${fmt(myDeposit)} ${COIN_SYMBOL} deposit` : "Deposit withdrawn"}
              </button>
            )}
          </div>
          {!account && !isDemo && <p className="quiet">Connect a wallet to take part.</p>}

          <section className="members">
            <h2>{circle.status === STATUS.OPEN ? "Members so far" : "Payout order"}</h2>
            <ol>
              {circle.members.map((m, i) => {
                const strikes = circle.strikes[m] ?? 0;
                const collected = circle.status !== STATUS.OPEN && i < circle.round;
                return (
                  <li key={m} className={m === recipient ? "member member-now" : "member"}>
                    <span className="addr">
                      {short(m)}
                      {m === me && <em> you</em>}
                    </span>
                    <span className="member-state">
                      {collected
                        ? "Collected"
                        : m === recipient
                          ? "Collecting now"
                          : circle.status === STATUS.ACTIVE
                            ? circle.paid.includes(m)
                              ? "Paid"
                              : "Not paid yet"
                            : m === circle.creator
                              ? "Creator"
                              : ""}
                      {circle.status === STATUS.ACTIVE && m === recipient && (circle.paid.includes(m) ? ", paid" : ", not paid yet")}
                      {strikes > 0 && <span className="strike"> {strikes} missed</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>

          {circle.totalPaidOut > 0n && (
            <p className="quiet">
              {fmt(circle.totalPaidOut)} {COIN_SYMBOL} paid out so far.
            </p>
          )}
        </div>
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
