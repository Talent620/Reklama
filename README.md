# Reklama — Autonomous Growth Engine

An autonomous performance-marketing system. You give it a business brief; it
runs the full growth loop on its own:

```
brief → analysis → strategy → creative → landing → publish → measure → optimize → report → (repeat)
```

It picks channels, splits the budget, writes ad copy and landing pages, prepares
campaigns through official-API adapters, simulates/ingests performance, kills
losers, scales winners, and reports — all within hard safety rails.

> **Safety first.** Nothing is published to a live ad account without (a) real
> credentials *and* (b) explicit human approval. Without both, every campaign is
> a **dry-run DRAFT** — the whole pipeline still runs end-to-end, it just never
> spends money. Budgets are capped by a human-set ceiling that the autonomous
> loop can never exceed on its own.

---

## Quick start

```bash
npm install
npm test          # 17 tests — full pipeline, deterministic, no network/secrets
npm run dev       # http://localhost:3000 — fill the brief, click "Run growth loop"
```

No API keys required. With none set, the engine uses a deterministic rule-based
AI provider so runs are reproducible and CI is hermetic. Set `ANTHROPIC_API_KEY`
to upgrade copy/strategy generation to the Claude API (see `.env.example`).

### With Postgres (persistence)

```bash
docker compose up db -d
cp .env.example .env            # adjust DATABASE_URL if needed
npx prisma migrate dev
npm run seed                    # creates a demo brief + persisted run
npm run dev
```

### Full stack in Docker

```bash
docker compose up --build       # app on :3000, postgres on :5432
```

---

## Architecture

Everything growth-critical lives in a **pure, framework-free engine** under
`src/lib/engine/` — no React/Next/Prisma imports — so it runs identically in a
test, an API route, a worker, or a cron job, and stays fully deterministic.

| Module | File | Responsibility |
| --- | --- | --- |
| Brief | `engine/brief.ts` | Validate & normalise business context (zod), derive target CPA |
| Analysis | `engine/analysis.ts` | Segments, seasonality, competitor angles, per-channel fit scores |
| Strategy | `engine/strategy.ts` | Channel mix, budget split, KPI targets, A/B experiments, decision log |
| Creative | `engine/creative.ts` | A/B ad variants (copy, CTA, visual brief) within platform char limits |
| Landing | `engine/landing.ts` | Conversion-ready page spec (hero/benefits/proof/FAQ/form/CTA/SEO) |
| Channels | `engine/channels/*` | Adapter abstraction + per-platform policy validation (official APIs only) |
| Publish | `engine/publish.ts` | Routes campaigns through adapters; enforces budget ceiling + approval gate |
| Monitoring | `engine/monitoring.ts` | Derives CTR/CPC/CPA/ROAS/CVR; deterministic simulator when no live data |
| Optimization | `engine/optimization.ts` | Pause losers, promote winners, reallocate budget, flag anomalies, convergence |
| Reporting | `engine/reporting.ts` | KPI status, top variants, insights, recommendations, next steps |
| Orchestrator | `engine/orchestrator.ts` | Runs the whole loop end-to-end |

The AI seam (`src/lib/ai/provider.ts`) swaps between a deterministic
`RuleBasedProvider` and a `ClaudeProvider` purely from the environment.

### App layer

- `src/app/page.tsx` — dashboard: submit a brief, see the full run.
- `src/app/api/run` — runs the loop (always dry-run from HTTP).
- `src/app/api/health` — liveness + capability probe.

---

## Decision logic & autonomy

Every strategic choice is made by considering ≥3 options, picking one, and
recording the rationale in `strategy.decisionLog` (visible in the dashboard).
The priority order, per the product spec, is:

1. safety & compliance → 2. business-goal fit → 3. ROI potential →
4. ease of implementation → 5. speed of testing → 6. automatability → 7. scalability.

Where the brief is silent, the engine takes the best reasonable assumption,
records it explicitly in `analysis.assumptions`, and keeps going.

### Human-in-the-loop gates

A human is asked **only** for the things that genuinely require it:
first live spend, raising the budget ceiling, connecting ad accounts, and any
legal/compliance change. Everything else is autonomous.

---

## Compliance

- Official platform APIs only; no scraping, no policy circumvention.
- Truthful-advertising guardrails baked into every creative (`complianceNotes`).
- GDPR-aware: consent-based tracking, privacy notice on lead forms.
- UTM tagging + a fixed analytics event taxonomy on every landing page.

---

## Testing

`npm test` runs the full pipeline deterministically (no network, no secrets):
brief validation, analysis, strategy/budget math, creative caps, landing
structure, metric derivation, optimization safety rails, reporting, and two
end-to-end orchestrator runs (including a determinism check). CI
(`.github/workflows/ci.yml`) runs typecheck + tests + build on every push.

## Roadmap

- Wire concrete official-API clients into the channel adapters (`publishLive`).
- Persist every loop iteration and optimise against real historical data.
- Render landing pages as live Next.js routes from the `LandingPage` spec.
- Multi-model AI roles (separate strategy/copy/creative/QA models).
