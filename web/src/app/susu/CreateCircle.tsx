"use client";

import { useState } from "react";
import { COIN_SYMBOL, toBase, txCreate } from "@/lib/susu";
import type { RunTx } from "./App";

const DURATIONS = [
  { label: "5 minutes (demo)", ms: 5 * 60_000 },
  { label: "1 hour", ms: 60 * 60_000 },
  { label: "1 day", ms: 24 * 60 * 60_000 },
  { label: "1 week", ms: 7 * 24 * 60 * 60_000 },
  { label: "1 month", ms: 30 * 24 * 60 * 60_000 },
];

export function CreateCircle(props: {
  connected: boolean;
  busy: boolean;
  run: RunTx;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [contribution, setContribution] = useState("0.1");
  const [deposit, setDeposit] = useState("0.1");
  const [seats, setSeats] = useState(4);
  const [duration, setDuration] = useState(DURATIONS[0].ms);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let c: bigint, d: bigint;
    try {
      c = toBase(contribution);
      d = toBase(deposit);
    } catch {
      setError("Enter amounts as numbers, like 0.5.");
      return;
    }
    if (!name.trim()) return setError("Give the circle a name.");
    if (c <= 0n) return setError("Contribution must be more than zero.");
    if (d < c) return setError("The deposit must be at least one contribution.");

    const ok = await props.run(
      txCreate({ name: name.trim(), contribution: c, deposit: d, maxMembers: seats, roundDurationMs: duration }),
      `Opened ${name.trim()}. Share the link so members can join.`,
    );
    if (ok) {
      setName("");
      props.onCreated();
    }
  }

  return (
    <form className="create" onSubmit={submit}>
      <h2>Open a circle</h2>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Makola traders" maxLength={48} />
      </label>
      <div className="pair">
        <label>
          Each round ({COIN_SYMBOL})
          <input inputMode="decimal" value={contribution} onChange={(e) => setContribution(e.target.value)} />
        </label>
        <label>
          Deposit ({COIN_SYMBOL})
          <input inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
        </label>
      </div>
      <div className="pair">
        <label>
          Seats
          <input
            type="number"
            min={2}
            max={20}
            value={seats}
            onChange={(e) => setSeats(Math.max(2, Math.min(20, Number(e.target.value) || 2)))}
          />
        </label>
        <label>
          Round length
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {DURATIONS.map((d) => (
              <option key={d.ms} value={d.ms}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="hint">
        The deposit covers a missed payment. You lock it now and get back what&apos;s left at the end.
      </p>
      {error && <p className="field-error">{error}</p>}
      <button className="btn btn-primary" disabled={!props.connected || props.busy}>
        {props.connected ? "Open circle" : "Connect a wallet to open a circle"}
      </button>
    </form>
  );
}
