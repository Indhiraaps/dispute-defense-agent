import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dispute Defense Agent",
  description: "Helps small PayPal sellers decide whether to fight a dispute, then builds cited evidence for approval.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
