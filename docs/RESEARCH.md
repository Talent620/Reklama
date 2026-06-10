# Research — official integrations, optimization, compliance

This document records the research behind Reklama's design decisions and the
concrete integration path for going live. Sources are cited inline. Captured
June 2026.

---

## 1. Official ad-platform APIs (the only sanctioned automation path)

Reklama publishes **exclusively through official platform APIs** — no scraping,
no policy circumvention. The concrete contracts below are encoded as
machine-readable specs in `src/lib/engine/channels/api-specs.ts` so each
adapter's `publishLive` can be implemented without ambiguity.

### Meta Ads — Marketing API (Graph API)
- **Auth:** System User access token from Business Manager. These are the
  "gold standard" for automation — non-expiring while maintained and not tied
  to a person staying logged in.
- **Hierarchy:** `Ad Account (act_{id})` → `Campaign` → `Ad Set` → `Ad Creative` → `Ad`.
- **Create:** `POST /act_{ad_account_id}/campaigns` with an objective
  (`OUTCOME_SALES`, `OUTCOME_LEADS`, …) and `status=PAUSED`; budget + targeting
  live on the **Ad Set** (`/act_{id}/adsets`).
- **2025/26 caveat:** Use the **unified Advantage+** structure for new builds;
  legacy ASC/AAC workflows are deprecated in Q1 2026 (MAPI v25).
- Docs: <https://developers.facebook.com/documentation/ads-commerce/marketing-api>

### Google Ads — Google Ads API v23 (REST)
- **Auth:** OAuth2 access token **plus** a `developer-token` header and a
  `login-customer-id` header on every call; service account in a Cloud project
  for server-to-server.
- **Hierarchy:** `Customer` → `Campaign Budget` → `Campaign` → `Ad Group` → `Ad Group Ad`.
- **Create:** mutate a `CampaignBudget` first
  (`/customers/{id}/campaignBudgets:mutate`), then reference it from
  `/customers/{id}/campaigns:mutate`.
- **Caveat:** Developer tokens have access tiers (Test/Basic/Standard, plus the
  new **Explorer** tier introduced Feb 2026); approval can backlog — plan for it.
- Docs: <https://developers.google.com/google-ads/api/rest/examples>

### TikTok Ads — Marketing API
- **Auth:** OAuth 2.0 advertiser authorization → access token (**refresh
  daily**; refresh token valid one year). Production requires passing TikTok's
  app review + data-security check.
- **Hierarchy:** `Business Center` → `Advertiser` → `Campaign` → `Ad Group` → `Ad`.
- **Caveat:** **Sandbox tokens do not work against production** — different app
  credentials and base URL. Conversion tracking (Events API) uses a separate
  pixel-tied long-lived token, not user OAuth.
- Docs: <https://business-api.tiktok.com/portal>

### LinkedIn Ads — Marketing API
- **Auth:** 3-legged OAuth 2.0 with `rw_ads`; `LinkedIn-Version` header (YYYYMM).
- **Hierarchy:** `Ad Account` → `Campaign Group` → `Campaign` → `Creative`.
- **Caveat:** Requires Marketing Developer Platform access approval.
- Docs: <https://learn.microsoft.com/en-us/linkedin/marketing/>

**Design consequence:** the `ChannelAdapter` abstraction + `ChannelApiSpec`
metadata mean a new official integration is "fill in `publishLive` against the
spec" — and until that's done, the base adapter **refuses to fake a spend**.

---

## 2. Autonomous budget optimization — budgeted multi-armed bandits

Static budget splits leave money on the table; the literature favours
**budgeted multi-armed bandits with Thompson sampling** for allocating spend
across channels under a budget constraint.

- **Algorithm (Xia et al., IJCAI 2015):** each round, sample a reward and a cost
  from each arm's posterior, take the **reward/cost ratio**, pull the best arm,
  update posteriors. Regret is bounded `O(ln B)` in the budget `B`.
- **Multichannel advertising:** recent work frames cross-channel budget
  allocation as a combinatorial bandit with Bayesian hierarchical priors and
  Thompson sampling to balance exploration vs exploitation.

**Implementation:** `src/lib/engine/bandit.ts` models each channel as an arm with
a Beta(1+conversions, 1+fails) reward (conversion-rate) posterior and an
observed CPC cost. It runs N Thompson rounds, picks the best sampled
reward/cost ratio each round, and sets budget share ∝ win frequency — so
unproven channels still get explored via their wide posteriors, and a hard
per-channel ceiling is enforced (safety rail). The Beta posterior is sampled
via a normal approximation (Box–Muller) to stay dependency-free and
deterministic under a seeded RNG. The orchestrator attaches a
`recommendedAllocation` to every loop iteration.

Sources:
- Thompson Sampling for Budgeted Multi-armed Bandits — <https://arxiv.org/abs/1505.00146> · <https://www.ijcai.org/Proceedings/15/Papers/556.pdf>
- Adaptive Budget Optimization for Multichannel Advertising Using Combinatorial Bandits — <https://arxiv.org/html/2502.02920>
- Multi-Task Combinatorial Bandits for Budget Allocation — <https://arxiv.org/html/2409.00561v1>
- Multi-armed bandits for performance marketing — <https://link.springer.com/article/10.1007/s41060-023-00493-7>

---

## 3. Compliance — GDPR & Google Consent Mode v2

EEA rules require advertising tags to withhold personal-data collection until
consent, and to carry the **Consent Mode v2** signals.

- Since **March 2024** Google requires Consent Mode v2 for any site serving ads
  to / monitoring EEA users; from **July 2025** it began restricting data
  collection from sites that don't transmit consent signals.
- v2 adds two signals beyond storage consent: **`ad_user_data`** (may data be
  sent to Google for ads) and **`ad_personalization`** (may it be used for
  personalised ads / remarketing).
- A **certified Consent Management Platform** is required; non-compliance risks
  GDPR fines (up to €20M / 4% of global revenue) and ad-product suspension.

**Implementation:** the landing renderer (`src/components/LandingRenderer.tsx`)
ships a Consent Mode v2-style gate — **deny by default**, a consent banner, and
analytics that only fire (and only send `ad_user_data`/`ad_personalization`)
after explicit "Accept". Lead forms carry a privacy/consent checkbox. This is a
reference implementation; in production, swap the banner for a certified CMP.

Sources:
- Updates to consent mode for EEA traffic (Google Ads Help) — <https://support.google.com/google-ads/answer/13695607?hl=en>
- Google Consent Mode v2 — what you need to know (Didomi) — <https://www.didomi.io/blog/google-consent-mode-v2-what-you-need-to-know>
- EU User Consent Policy guide (CookieYes) — <https://www.cookieyes.com/blog/eu-user-consent-policy/>

---

## Net design impact

| Research finding | Where it landed in the code |
| --- | --- |
| Official APIs only, concrete contracts | `channels/api-specs.ts`, `channels/base.ts` (refuses fake spend) |
| Budgeted Thompson sampling beats static splits | `engine/bandit.ts`, orchestrator `recommendedAllocation` |
| Consent Mode v2 mandatory in EEA | `components/LandingRenderer.tsx` consent gate + banner |
| Token/auth models differ per platform | `ChannelApiSpec.auth` per channel |
