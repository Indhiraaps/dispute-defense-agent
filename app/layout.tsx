import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "600"], display: "swap" });

export const metadata: Metadata = {
  title: "Dispute Defense Agent",
  description: "Helps small PayPal sellers decide whether to fight a dispute, then builds cited evidence for approval.",
};

function ShieldMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 2.5 4.5 7v8.2c0 7.2 4.9 12.4 11.5 14.3 6.6-1.9 11.5-7.1 11.5-14.3V7L16 2.5Z" fill="currentColor" opacity=".18" />
      <path d="M16 2.5 4.5 7v8.2c0 7.2 4.9 12.4 11.5 14.3 6.6-1.9 11.5-7.1 11.5-14.3V7L16 2.5Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="m10.5 16.2 3.7 3.7 7.3-7.6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <header className="appbar">
          <div className="appbar-inner">
            <Link href="/" className="brand" aria-label="Dispute Defense Agent, dispute inbox">
              <ShieldMark />
              <span className="brand-name">Dispute Defense</span>
              <span className="brand-tag">Agent</span>
            </Link>
            <nav className="appnav" aria-label="Main">
              <Link href="/">Disputes</Link>
            </nav>
            <div className="appbar-right">
              <span className="env-badge" title="Connected to the PayPal sandbox. No real money moves.">Sandbox</span>
              <span className="store">
                <span className="store-avatar" aria-hidden="true">A</span>
                <span className="store-name">Asha&apos;s Handmade Store</span>
              </span>
            </div>
          </div>
        </header>
        {children}
        <footer className="appfoot">
          <span>Every fact cited to a record</span>
          <span aria-hidden="true">·</span>
          <span>Scored by rules, not AI</span>
          <span aria-hidden="true">·</span>
          <span>Nothing reaches PayPal without your approval</span>
        </footer>
      </body>
    </html>
  );
}
