"use client";

import dynamic from "next/dynamic";

const App = dynamic(() => import("./susu/App"), {
  ssr: false,
  loading: () => <p className="boot">Loading Susu Circle…</p>,
});

export default function Page() {
  return <App />;
}
