import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reklama — Autonomous Growth Engine",
  description: "Brief → analysis → strategy → creative → landing → publish → optimize → report, on a loop.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto max-w-6xl px-4 py-8">
          <header className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">
                Reklama <span className="text-accent">Growth Engine</span>
              </h1>
              <p className="text-sm text-slate-400">Autonomous performance marketing — official APIs only, human-gated spend.</p>
            </div>
            <a className="text-sm text-slate-400 hover:text-white" href="https://code.claude.com/docs/en/claude-code-on-the-web" target="_blank" rel="noreferrer">
              docs ↗
            </a>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
