import type { Metadata, Viewport } from "next";
import { Figtree, Fredoka } from "next/font/google";
import "./globals.css";

const fredoka = Fredoka({ variable: "--font-display", subsets: ["latin"], weight: ["500", "600", "700"] });
const figtree = Figtree({ variable: "--font-body", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Susu Circle",
  description:
    "Savings circles on Sui. Everyone adds the same amount each round, one member takes the pot home, and a smart contract keeps it fair.",
};

export const viewport: Viewport = {
  themeColor: "#0c1533",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fredoka.variable} ${figtree.variable}`}>
      <body>{children}</body>
    </html>
  );
}
