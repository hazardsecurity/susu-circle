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
import { COIN_SYMBOL, PACKAGE_ID, explainError, fetchRecentCircles, fmt, type CircleSummary } from "@/lib/susu";
import { Campfire } from "./Campfire";
import { CircleView } from "./CircleView";
import { CreateCircle } from "./CreateCircle";
import { dAppKit } from "./dapp-kit";
import { HERO_CIRCLE } from "./demo";

export default function App() {
  return (
    <DAppKitProvider dAppKit={dAppKit}>
      <Shell />
    </DAppKitProvider>
  );
}

export type RunTx = (tx: Transaction, success: string) => Promise<boolean>;

function Shell() {
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const kit = useDAppKit();

  const [selected, setSelected] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("circle"),
  );
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
    window.scrollTo({ top: 0 });
  }, []);

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
    const list = await fetchRecentCircles(client).catch(() => []);
    setRecent(list);
    const mine = list.find((c) => c.creator === account?.address);
    if (mine) select(mine.id);
  }, [client, account, select]);

  return (
    <div className="page">
      <header className="top">
        <button className="brand" onClick={() => select(null)} aria-label="Susu Circle, home">
          <BrandMark />
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

      <main>
        {selected ? (
          <CircleView
            key={selected}
            id={selected}
            busy={busy}
            run={run}
            version={version}
            onBack={() => select(null)}
          />
        ) : (
          <Home
            connected={!!account}
            busy={busy}
            run={run}
            recent={recent}
            me={account?.address}
            onSelect={select}
            onCreated={onCreated}
          />
        )}
      </main>

      <footer className="foot">
        Built on Sui for the CLAY hackathon. Testnet only: use faucet SUI, not real money.
      </footer>
    </div>
  );
}

function Home(props: {
  connected: boolean;
  busy: boolean;
  run: RunTx;
  recent: CircleSummary[] | null;
  me?: string;
  onSelect: (id: string) => void;
  onCreated: () => void;
}) {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <h1 className="rise" style={{ "--d": 0 } as React.CSSProperties}>
            Save together, by the fire.
          </h1>
          <p className="rise" style={{ "--d": 1 } as React.CSSProperties}>
            A susu is a savings circle. Everyone adds the same amount each round, and each round one
            member takes the whole pot home. Here a Sui smart contract keeps the pot, draws the order
            at random, and covers anyone who misses a round from their deposit.
          </p>
          <div className="hero-actions rise" style={{ "--d": 2 } as React.CSSProperties}>
            <a className="btn btn-brand" href="#open">
              Open a circle
            </a>
            <button className="btn btn-ghost" onClick={() => props.onSelect("demo")}>
              Watch a sample round
            </button>
          </div>
        </div>
        <Campfire circle={HERO_CIRCLE} compact />
      </section>

      <section className="how" aria-labelledby="how-h" ref={revealRef}>
        <h2 id="how-h">How a circle works</h2>
        <ol>
          <li className="how-item">
            <strong>Open a circle.</strong> Pick how much each round is, how long a round lasts, and how
            many seats.
          </li>
          <li className="how-item">
            <strong>Invite your people.</strong> Each one locks a deposit to take a seat.
          </li>
          <li className="how-item">
            <strong>Light the fire.</strong> On-chain randomness draws who collects first.
          </li>
          <li className="how-item">
            <strong>Add to the fire each round.</strong> Once everyone&apos;s paid, anyone can pass the
            pot.
          </li>
          <li className="how-item">
            <strong>Take your deposit home</strong> after the last round.
          </li>
        </ol>
      </section>

      <div className="home-grid" id="open" ref={revealRef}>
        {PACKAGE_ID ? (
          <CreateCircle connected={props.connected} busy={props.busy} run={props.run} onCreated={props.onCreated} />
        ) : (
          <section className="panel">
            <h2>Connect the contract</h2>
            <p className="quiet">
              Publish the Move package, then set <code>NEXT_PUBLIC_SUSU_PACKAGE_ID</code> in{" "}
              <code>web/.env.local</code> and restart the dev server.
            </p>
          </section>
        )}

        <section className="recent" aria-labelledby="recent-h">
          <h2 id="recent-h">Fires burning now</h2>
          {!PACKAGE_ID ? (
            <p className="quiet">Circles show up here once the contract is connected.</p>
          ) : props.recent === null ? (
            <p className="quiet">Looking for circles…</p>
          ) : props.recent.length === 0 ? (
            <p className="quiet">No circles yet. Open the first one and invite your people.</p>
          ) : (
            <ul>
              {props.recent.map((c) => (
                <li key={c.id}>
                  <button className="row" onClick={() => props.onSelect(c.id)}>
                    <span className="row-name">{c.name}</span>
                    <span className="row-meta">
                      {fmt(c.contribution)} {COIN_SYMBOL} a round, {c.maxMembers} seats
                      {c.creator === props.me ? ", yours" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

/** Adds "is-in" once the element scrolls into view, so its children can rise in. */
function revealRef(el: HTMLElement | null) {
  if (!el || el.dataset.reveal) return;
  el.dataset.reveal = "pending";
  if (!("IntersectionObserver" in window)) {
    el.dataset.reveal = "in";
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        el.dataset.reveal = "in";
        io.disconnect();
      }
    },
    { threshold: 0.2 },
  );
  io.observe(el);
}

function BrandMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
      <path d="M15 4 C9 9 9 15 12 18 C11 14 14 12 15 9 C16 13 20 14 18 19 C22 16 22 9 15 4 Z" fill="var(--brand)" />
      <path d="M15 11 C12 14 13 17 15 19 C17 17 18 14 15 11 Z" fill="var(--flame)" />
      <rect x="6" y="21" width="18" height="3.4" rx="1.7" fill="var(--log)" transform="rotate(10 15 22.7)" />
      <rect x="6" y="21" width="18" height="3.4" rx="1.7" fill="var(--log)" transform="rotate(-10 15 22.7)" />
    </svg>
  );
}
