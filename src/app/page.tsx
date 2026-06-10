"use client";

import { useState } from "react";
import type { RunResult } from "@/lib/engine";

const SAMPLE = {
  company: "Brewly",
  product: "Brewly Cold Brew Kit",
  description: "Make barista-grade cold brew at home in 5 minutes. Reusable, zero waste.",
  model: "ecommerce",
  goal: "sales",
  currency: "PLN",
  monthlyBudget: 6000,
  averageOrderValue: 120,
  grossMargin: 0.6,
};

export default function Page() {
  const [form, setForm] = useState(SAMPLE);
  const [result, setResult] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          monthlyBudget: Number(form.monthlyBudget),
          averageOrderValue: Number(form.averageOrderValue),
          grossMargin: Number(form.grossMargin),
          config: { iterations: 4 },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Run failed");
      setResult(data as RunResult);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      {/* Brief form */}
      <section className="card h-fit">
        <h2 className="mb-4 text-lg font-semibold">1 · Business brief</h2>
        <div className="space-y-3">
          <Field label="Company"><input className="input" value={form.company} onChange={(e) => set("company", e.target.value)} /></Field>
          <Field label="Product"><input className="input" value={form.product} onChange={(e) => set("product", e.target.value)} /></Field>
          <Field label="Description"><textarea className="textarea" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Model">
              <select className="select" value={form.model} onChange={(e) => set("model", e.target.value)}>
                {["ecommerce", "saas", "local_service", "b2b", "marketplace", "content"].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Goal">
              <select className="select" value={form.goal} onChange={(e) => set("goal", e.target.value)}>
                {["sales", "leads", "brand_awareness", "traffic", "app_installs", "local_visits"].map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Currency"><input className="input" value={form.currency} onChange={(e) => set("currency", e.target.value)} /></Field>
            <Field label="Budget/mo"><input className="input" type="number" value={form.monthlyBudget} onChange={(e) => set("monthlyBudget", Number(e.target.value))} /></Field>
            <Field label="AOV"><input className="input" type="number" value={form.averageOrderValue} onChange={(e) => set("averageOrderValue", Number(e.target.value))} /></Field>
          </div>
          <button className="btn w-full" onClick={run} disabled={loading}>
            {loading ? "Running loop…" : "Run growth loop ▶"}
          </button>
          <p className="text-xs text-slate-500">Publishing runs in safe dry-run. Going live requires explicit human approval.</p>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </section>

      {/* Results */}
      <section className="space-y-6">
        {!result && !loading && <Placeholder />}
        {result && <Results result={result} />}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function Placeholder() {
  return (
    <div className="card text-sm text-slate-400">
      <p>Fill the brief and run the loop. The engine will, autonomously and in dry-run:</p>
      <ol className="mt-3 list-decimal space-y-1 pl-5">
        <li>Analyze niche, segments, seasonality & channel potential</li>
        <li>Pick channels, split budget, set KPI targets & A/B experiments</li>
        <li>Generate ad creatives + two landing-page variants</li>
        <li>Prepare campaigns through official-API adapters (dry-run)</li>
        <li>Measure → optimize across iterations and report results</li>
      </ol>
    </div>
  );
}

function Results({ result }: { result: RunResult }) {
  const { analysis, strategy, creatives, landingPages, publish, iterations, report } = result;
  const last = iterations[iterations.length - 1];
  return (
    <>
      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Report</h2>
          <span className={`badge ${report.kpiStatus.every((k) => k.met) ? "bg-accent2/20 text-accent2" : "bg-warn/20 text-warn"}`}>
            {result.converged ? "converged" : "optimizing"}
          </span>
        </div>
        <p className="text-sm text-slate-300">{report.summary}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {report.kpiStatus.map((k) => (
            <span key={k.kpi} className={`badge ${k.met ? "bg-accent2/20 text-accent2" : "bg-danger/20 text-danger"}`}>
              {k.kpi}: {k.actual} / {k.target}
            </span>
          ))}
        </div>
        <ul className="mt-4 space-y-1 text-sm text-slate-400">
          {report.insights.map((i, n) => <li key={n}>• {i}</li>)}
        </ul>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Panel title={`Strategy · ${strategy.rolloutOrder.length} channels`}>
          {strategy.allocations.map((a) => (
            <Row key={a.channel} left={a.channel} right={`${a.dailyBudget} /day · ${Math.round(a.share * 100)}%`} />
          ))}
          <details className="mt-3 text-xs text-slate-400">
            <summary className="cursor-pointer">Decision log ({strategy.decisionLog.length})</summary>
            {strategy.decisionLog.map((d, i) => (
              <div key={i} className="mt-2 border-l border-white/10 pl-2">
                <div className="text-slate-300">{d.question}</div>
                <div>→ {d.chosen}</div>
              </div>
            ))}
          </details>
        </Panel>

        <Panel title={`Channel potential`}>
          {analysis.channelPotential.slice(0, 6).map((c) => (
            <Row key={c.channel} left={c.channel} right={`fit ${c.fit} · ~${c.estimatedCpa} CPA`} />
          ))}
        </Panel>

        <Panel title={`Creatives · ${creatives.length}`}>
          {creatives.slice(0, 4).map((c) => (
            <div key={c.id} className="border-b border-white/5 py-1.5 last:border-0">
              <div className="text-sm text-slate-200">{c.headline}</div>
              <div className="text-xs text-slate-500">{c.channel} · {c.cta}</div>
            </div>
          ))}
        </Panel>

        <Panel title={`Publish · ${publish.results.length} campaigns`}>
          {publish.results.map((r) => (
            <Row key={r.channel} left={r.channel} right={<span className={`badge ${r.dryRun ? "bg-warn/20 text-warn" : "bg-accent2/20 text-accent2"}`}>{r.status}{r.dryRun ? " (dry-run)" : ""}</span>} />
          ))}
        </Panel>

        <Panel title={`Landing pages · ${landingPages.length}`}>
          {landingPages.map((lp) => (
            <Row key={lp.id} left={`/${lp.slug}`} right={`variant ${lp.variant} · ${lp.sections.length} sections`} />
          ))}
        </Panel>

        <Panel title={`Last iteration actions`}>
          {last?.optimization.actions.map((a, i) => (
            <div key={i} className="border-b border-white/5 py-1 text-xs last:border-0">
              <span className="text-accent">{a.type}</span>
              <span className="text-slate-500"> — {"reason" in a ? a.reason : ""}</span>
            </div>
          ))}
        </Panel>
      </div>

      <div className="card">
        <h3 className="mb-2 text-sm font-semibold">Next steps</h3>
        <ul className="space-y-1 text-sm text-slate-400">
          {report.nextSteps.map((s, i) => <li key={i}>{i + 1}. {s}</li>)}
        </ul>
      </div>
    </>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h3 className="mb-3 text-sm font-semibold text-slate-200">{title}</h3>
      {children}
    </div>
  );
}

function Row({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-1.5 text-sm last:border-0">
      <span className="text-slate-300">{left}</span>
      <span className="text-slate-400">{right}</span>
    </div>
  );
}
