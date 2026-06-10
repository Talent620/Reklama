# Architecture

Reklama is split into a **pure engine** (deterministic, framework-free) and a
thin **app/infra shell** around it. This keeps growth logic testable in
isolation and reusable from an API route, a worker, a CLI, or a cron job.

```
┌─────────────────────────────────────────────────────────────────────┐
│  app shell  (Next.js)                                                 │
│   /(app) dashboard · /lp/[slug] landing pages                         │
│   /api/run · /api/metrics · /api/track · /api/health                  │
│   lib/db.ts (lazy Prisma) · lib/persistence.ts (best-effort)          │
└───────────────▲───────────────────────────────────────▲──────────────┘
                │ calls                                  │ persists
┌───────────────┴───────────────────────────────────────┴──────────────┐
│  engine  (src/lib/engine, no React/Next/Prisma)                       │
│                                                                       │
│  orchestrator ── the autonomous loop                                  │
│    1 brief ─ zod validate, target-CPA economics                       │
│    2 analysis ─ segments, seasonality, channel-fit, assumptions       │
│    3 strategy ─ channel mix, budget split, KPIs, experiments, log     │
│    4 creative ─ A/B variants  ──► creative-ai (copywriter role)       │
│    5 landing ─ page spec (rendered by /lp)                            │
│    6 publish ─► channels/* adapters (Meta/Google/TikTok/LinkedIn/…)   │
│         safety: budget ceiling + human-approval gate, dry-run default │
│    7 monitoring ─ derive CTR/CPC/CPA/ROAS; simulate or real history   │
│    8 optimization ─ pause/promote/reallocate/anomaly; convergence     │
│         bandit ─ budgeted Thompson-sampling reallocation              │
│    9 reporting ─ KPI status, insights, recommendations, next steps    │
└───────────────────────────────────────────────────────────────────────┘
                │ via AiProvider seam (rule-based ⇄ Claude)
        ai/provider.ts · ai/roles.ts
```

## Key seams

- **`AiProvider`** (`ai/provider.ts`): `RuleBasedProvider` (deterministic,
  offline, default) vs `ClaudeProvider` (Anthropic Messages API when
  `ANTHROPIC_API_KEY` is set). Resolved from env; the engine never calls a model
  directly. Roles in `ai/roles.ts`.
- **`ChannelAdapter`** (`channels/adapter.ts`): one interface per platform.
  `BaseAdapter.publish` enforces dry-run + the human-approval gate; concrete
  adapters override `publishLive` with the official-API calls. `fetch` is
  injected via `AdapterContext.fetchImpl` for hermetic tests.
- **Persistence** is optional and isolated in the app shell — the engine has no
  database dependency.

## Determinism

Every stochastic step (segment jitter, simulator, bandit sampling) draws from a
seeded PRNG (`engine/util.ts`). Identical input + seed ⇒ identical output, which
is why the whole pipeline is unit-testable and CI is hermetic.

## Safety model (defence in depth)

1. `/api/run` hard-codes `humanApproved: false` — the HTTP surface can never
   spend.
2. `BaseAdapter` downgrades any `LIVE` request to dry-run unless credentials
   **and** approval are present.
3. Live adapters create objects **paused/draft** — never auto-active.
4. `publish` clamps every channel to `REKLAMA_MAX_DAILY_BUDGET`; the bandit and
   optimizer also respect that ceiling.
5. Base `publishLive` refuses to fabricate a spend for unimplemented paths.

## Data flow for closed-loop learning

`/api/run` → `loadLatestMetrics(briefId)` warm-start → loop → `persistRun`.
Real platform results arrive via `POST /api/metrics` and feed the next run
(`config.simulate = false` to rely on them exclusively).
