import Link from "next/link";

/** Dashboard chrome. Landing pages (/lp/*) live outside this group and render full-bleed. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              Reklama <span className="text-accent">Growth Engine</span>
            </h1>
            <p className="text-sm text-slate-400">Autonomous performance marketing — official APIs only, human-gated spend.</p>
          </div>
          <nav className="flex gap-4 text-sm text-slate-400">
            <Link className="hover:text-white" href="/lp/brewly-cold-brew-kit-a">demo landing ↗</Link>
            <a className="hover:text-white" href="https://github.com/Talent620/Reklama" target="_blank" rel="noreferrer">github ↗</a>
          </nav>
        </header>
        {children}
      </div>
    </div>
  );
}
