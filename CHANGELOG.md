# Changelog

All notable changes to Reklama. Dates are build dates.

## Iteration 5 — completion pass
- **Google Ads** live adapter + REST v23 client (CampaignBudget → Campaign,
  PAUSED), with developer-token/login-customer-id auth and amountMicros budgets.
- **TikTok Ads** live adapter (campaign create, DISABLE/paused; treats non-zero
  API `code` as failure).
- **LinkedIn Ads** live adapter (campaign group, DRAFT; id read from
  `x-restli-id`).
- **History-based optimization**: the loop warm-starts from persisted metrics
  (`loadLatestMetrics`); `config.simulate = false` optimises purely on real data.
- **`POST /api/metrics`**: ingest real platform results against a brief's run.
- **Multi-model AI roles** (`ai/roles.ts`) + copywriter enhancement step
  (`creative-ai.ts`) — no-op under the deterministic provider.
- Docs: `ARCHITECTURE.md`, this changelog; README status + integration tables.
- Tests: **42** (added Google/TikTok/LinkedIn adapters, AI roles, history-based
  optimization).

## Iteration 4 — first live integration + persistence
- Real **Meta Marketing API** publish path (Campaign → Ad Set → Ad Creative →
  Ad), gated on human approval + credentials, objects created PAUSED.
- Injectable `fetch` across adapters for hermetic tests.
- Best-effort **Postgres persistence** (lazy Prisma client) wired into `/api/run`.

## Iteration 3 — research-backed engine
- Budgeted **Thompson-sampling** budget allocator (`engine/bandit.ts`).
- Concrete official-API specs per channel (`channels/api-specs.ts`).
- **Consent Mode v2** gate on landing pages.
- `docs/RESEARCH.md` with citations.

## Iteration 2 — live landing pages
- `/lp/[slug]` renders the `LandingPage` spec (hero/benefits/proof/FAQ/form/CTA).
- Consent-gated analytics → `/api/track`. One-click Vercel deploy.

## Iteration 1 — foundation
- Pure engine: brief, analysis, strategy, creative, landing, publish (dry-run),
  monitoring, optimization, reporting, orchestrator.
- Channel adapter abstraction; Next.js dashboard; Prisma schema; Docker; CI.
