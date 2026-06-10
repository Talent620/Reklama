import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reklama — Autonomous Growth Engine",
  description: "Brief → analysis → strategy → creative → landing → publish → optimize → report, on a loop.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
