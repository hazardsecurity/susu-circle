"use client";

import {
  DAppKitProvider,
  useCurrentAccount,
  useCurrentClient,
  useDAppKit,
} from "@mysten/dapp-kit-react";
import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import type { Transaction } from "@mysten/sui/transactions";
import { useCallback, useEffect, useState } from "react";
import { PACKAGE_ID, explainError, fetchRecentCircles, type CircleSummary } from "@/lib/susu";
import { dAppKit } from "./dapp-kit";
import { CircleView } from "./CircleView";
import { CreateCircle } from "./CreateCircle";

export default function App() {
  return (
    <DAppKitProvider dAppKit={dAppKit}>
      <Shell />
    </DAppKitProvider>
  );
}

export type RunTx = (tx: Transaction, success: string) => Promise<boolean>;

function readCircleFromUrl() {
  return new URLSearchParams(window.location.search).get("circle");
}

function Shell() {
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const kit = useDAppKit();

  const [selected, setSelected] = useState<string | null>(() => readCircleFromUrl());
  const [recent, setRecent] = useState<CircleSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [version, setVersion] = useState(0);

  const select = useCallback((id: string | null) => {
    setSelected(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("circle", id);
    else url.searchParams.delete("circle");
    window.history.replaceState(null, "", url);
  }, []);

  const loadRecent = useCallback(async () => {
    if (!PACKAGE_ID) return [];
    try {
      const list = await fetchRecentCircles(client);
      setRecent(list);
      return list;
    } catch {
      setRecent([]);
      return [];
    }
  }, [client]);

  useEffect(() => {
    if (!PACKAGE_ID) return;
    let alive = true;
    fetchRecentCircles(client).then(
      (list) => alive && setRecent(list),
      () => alive && setRecent([]),
    );
    return () => {
      alive = false;
    };
  }, [client, version]);

  const run: RunTx = useCallback(
    async (tx, success) => {
      setBusy(true);
      setNotice(null);
      try {
        const res = await kit.signAndExecuteTransaction({ transaction: tx });
        if (res.FailedTransaction) {
          throw new Error(res.FailedTransaction.status.error?.message ?? "Transaction failed.");
        }
        await client.waitForTransaction({ digest: res.Transaction.digest });
        setNotice({ kind: "ok", text: success });
        setVersion((v) => v + 1);
        return true;
      } catch (e) {
        setNotice({ kind: "err", text: explainError(e) });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [kit, client],
  );

  const onCreated = useCallback(async () => {
    const list = await loadRecent();
    const mine = list.find((c) => c.creator === account?.address);
    if (mine) select(mine.id);
  }, [loadRecent, account, select]);

  return (
    <div className="page">
      <header className="top">
        <button className="brand" onClick={() => select(null)} aria-label="Susu Circle home">
          <RingMark />
          <span>Susu Circle</span>
        </button>
        <span className="net">Sui testnet</span>
        <div className="connect">
          <ConnectButton />
        </div>
      </header>

      {notice && (
        <div className={`notice notice-${notice.kind}`} role="status">
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {!PACKAGE_ID && selected !== "demo" ? (
        <SetupNeeded onDemo={() => select("demo")} />
      ) : (
        <div className="layout">
          <aside className="rail">
            <CreateCircle connected={!!account && !!PACKAGE_ID} busy={busy} run={run} onCreated={onCreated} />
            <section className="recent">
              <h2>Recent circles</h2>
              {!PACKAGE_ID ? (
                <p className="quiet">Circles show up here once the contract is published.</p>
              ) : recent === null ? (
                <p className="quiet">Loading…</p>
              ) : recent.length === 0 ? (
                <p className="quiet">No circles yet. Open the first one.</p>
              ) : (
                <ul>
                  {recent.map((c) => (
                    <li key={c.id}>
                      <button
                        className={c.id === selected ? "row row-on" : "row"}
                        onClick={() => select(c.id)}
                      >
                        <span className="row-name">{c.name}</span>
                        <span className="row-meta">
                          {c.maxMembers} seats
                          {c.creator === account?.address ? ", yours" : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>

          <main className="main">
            {selected ? (
              <CircleView key={selected} id={selected} busy={busy} run={run} version={version} />
            ) : (
              <Intro onDemo={() => select("demo")} />
            )}
          </main>
        </div>
      )}
    </div>
  );
}

function Intro({ onDemo }: { onDemo: () => void }) {
  return (
    <div className="intro">
      <h1>Save together. Take turns collecting the pot.</h1>
      <p>
        A susu is a savings circle: everyone pays the same amount each round, and each round one
        member takes the whole pot. Here a Sui smart contract holds the money, picks the payout
        order at random, and covers anyone who misses a payment from their deposit.
      </p>
      <ol className="steps">
        <li>
          <strong>Open a circle.</strong> Set the contribution, round length and number of seats.
        </li>
        <li>
          <strong>Invite members.</strong> Each one locks a deposit to take a seat.
        </li>
        <li>
          <strong>Start it.</strong> On-chain randomness shuffles who gets paid first.
        </li>
        <li>
          <strong>Pay each round.</strong> When everyone has paid, anyone can release the pot.
        </li>
        <li>
          <strong>Get your deposit back</strong> after the last round.
        </li>
      </ol>
      <button className="btn btn-quiet" onClick={onDemo}>
        See a sample circle
      </button>
    </div>
  );
}

function SetupNeeded({ onDemo }: { onDemo: () => void }) {
  return (
    <div className="intro">
      <h1>Connect the contract</h1>
      <p>
        This app needs the ID of the published Susu package. Publish it from the <code>move</code>{" "}
        folder, then set <code>NEXT_PUBLIC_SUSU_PACKAGE_ID</code> in <code>web/.env.local</code>{" "}
        and restart the dev server.
      </p>
      <pre>
        <code>cd move && sui client publish</code>
      </pre>
      <button className="btn btn-quiet" onClick={onDemo}>
        See a sample circle
      </button>
    </div>
  );
}

function RingMark() {
  const seats = 6;
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="14" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {Array.from({ length: seats }, (_, i) => {
        const a = (i / seats) * Math.PI * 2 - Math.PI / 2;
        return (
          <circle
            key={i}
            cx={14 + 9 * Math.cos(a)}
            cy={14 + 9 * Math.sin(a)}
            r={i === 0 ? 3.4 : 2.4}
            fill={i === 0 ? "var(--marigold)" : "currentColor"}
          />
        );
      })}
    </svg>
  );
}
