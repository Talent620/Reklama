# Reklama — Autonomous Growth Engine

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Talent620/Reklama/tree/claude/autonomous-growth-engine-aki9mu)

> **Get a live link in ~2 minutes:** click the button above (no env vars
> required — the engine falls back to its deterministic AI provider and all
> publishing is dry-run). Or run it locally with the Quick start below.
> Live routes once deployed: `/` (dashboard), `/lp/brewly-cold-brew-kit-a`
> (a generated landing page), `/api/health`.

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

- `src/app/(app)/page.tsx` — dashboard: submit a brief, see the full run.
- `src/app/lp/[slug]/page.tsx` — **live, generated landing pages** rendered
  from the `LandingPage` spec (hero/benefits/proof/FAQ/form/CTA), pre-rendered
  at build time, with consent-gated analytics. Demo slugs:
  `brewly-cold-brew-kit-a`, `brewly-cold-brew-kit-b`, `pipelineiq-a`, `pipelineiq-b`.
- `src/app/api/run` — runs the loop (always dry-run from HTTP).
- `src/app/api/track` — analytics event sink for landing pages.
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

## Research-backed design

See [`docs/RESEARCH.md`](docs/RESEARCH.md) for the cited research behind the
build. Highlights now in the codebase:

- **Budgeted Thompson-sampling allocator** (`engine/bandit.ts`) — channels are
  arms with Beta reward / CPC cost posteriors; budget share ∝ win frequency, so
  the loop explores new channels and exploits winners while respecting a hard
  per-channel ceiling. Based on Xia et al. (IJCAI 2015) and multichannel
  combinatorial-bandit work. Surfaced as `iteration.recommendedAllocation`.
- **Concrete official-API specs** (`channels/api-specs.ts`) — real endpoints,
  auth models, and resource hierarchies for Meta / Google / TikTok / LinkedIn,
  so `publishLive` is a fill-in-the-blanks, not a research project.
- **Google Consent Mode v2 gate** on landing pages — deny-by-default, consent
  banner, and `ad_user_data` / `ad_personalization` signals, per EEA rules.

## Live Meta integration (real, gated, no auto-spend)

`channels/meta.ts` + `channels/meta-client.ts` implement the real Meta Marketing
API path (Campaign → Ad Set → Ad Creative → Ad) against the official Graph API.
It activates **only** when all of the following hold:

1. a human approved the run (`humanApproved: true`), **and**
2. a System User token + ad-account id + page id are provided.

Even then, every object is created **PAUSED** — standing up a campaign spends
nothing; turning it on is a separate, deliberate action in Ads Manager. The HTTP
`/api/run` endpoint never authorises live publishing; you must call the engine
programmatically and pass the approval + credentials:

```ts
import { runGrowthLoop } from "@/lib/engine";

await runGrowthLoop(brief, {
  humanApproved: true,
  credentials: { meta_ads: process.env.META_ADS_ACCESS_TOKEN! },
  accounts: { meta_ads: { accountId: process.env.META_ADS_AD_ACCOUNT_ID!, pageId: process.env.META_ADS_PAGE_ID!, countries: ["PL"] } },
});
```

The client takes an injectable `fetch`, so the whole flow is unit-tested
(`tests/meta.test.ts`) with no network and no spend.

## Persistence

`/api/run` persists each run (brief, campaigns, final metrics) to Postgres when
`DATABASE_URL` is set, via `src/lib/persistence.ts` — **best-effort and
non-blocking**: with no database it returns a clear no-op and still hands back
the full run. `npm run seed` writes a demo brief + run. Schema in
`prisma/schema.prisma`.

## Roadmap

- Extend `publishLive` to Google Ads / TikTok / LinkedIn against `api-specs.ts`.
- Optimise against persisted historical metrics across periods.
- Swap the demo consent banner for a certified CMP.
- Multi-model AI roles (separate strategy/copy/creative/QA models).
