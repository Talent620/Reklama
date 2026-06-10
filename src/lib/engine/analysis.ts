/**
 * Analysis module — turns a brief into market understanding.
 *
 * It derives audience segments, seasonality, competitor angles, and a
 * per-channel potential score. The heuristics encode real media-buying
 * priors (e.g. LinkedIn fits B2B, TikTok skews low-intent reach, Search wins
 * on intent) so the output is sensible without any external data — and every
 * gap the brief leaves is recorded as an explicit assumption.
 */
import type {
  Analysis,
  AudienceSegment,
  Brief,
  ChannelId,
  ChannelPotential,
  SeasonalityPoint,
} from "./types";
import { targetCpa } from "./brief";
import { clamp, round, seededRng, stableId } from "./util";

const ALL_CHANNELS: ChannelId[] = [
  "google_ads",
  "meta_ads",
  "linkedin_ads",
  "tiktok_ads",
  "youtube_ads",
  "display_remarketing",
  "email",
  "seo_organic",
];

/** Base fit of each channel per business model (0..1), refined by goal below. */
const MODEL_CHANNEL_FIT: Record<Brief["model"], Partial<Record<ChannelId, number>>> = {
  ecommerce: { google_ads: 0.9, meta_ads: 0.95, tiktok_ads: 0.8, youtube_ads: 0.6, display_remarketing: 0.85, email: 0.7, seo_organic: 0.7 },
  saas: { google_ads: 0.85, linkedin_ads: 0.8, meta_ads: 0.6, youtube_ads: 0.55, display_remarketing: 0.6, email: 0.75, seo_organic: 0.9 },
  local_service: { google_ads: 0.95, meta_ads: 0.8, seo_organic: 0.85, display_remarketing: 0.5, email: 0.4 },
  b2b: { linkedin_ads: 0.95, google_ads: 0.85, email: 0.7, seo_organic: 0.85, youtube_ads: 0.5, display_remarketing: 0.55 },
  marketplace: { google_ads: 0.85, meta_ads: 0.85, tiktok_ads: 0.7, display_remarketing: 0.8, seo_organic: 0.75, email: 0.65 },
  content: { meta_ads: 0.8, tiktok_ads: 0.85, youtube_ads: 0.8, seo_organic: 0.9, email: 0.7, google_ads: 0.6 },
};

/** Goal nudges: how much each goal rewards a channel's strength. */
const GOAL_CHANNEL_BONUS: Record<Brief["goal"], Partial<Record<ChannelId, number>>> = {
  sales: { google_ads: 0.1, meta_ads: 0.08, display_remarketing: 0.08 },
  leads: { linkedin_ads: 0.1, google_ads: 0.08, meta_ads: 0.05 },
  brand_awareness: { youtube_ads: 0.12, tiktok_ads: 0.1, meta_ads: 0.06 },
  traffic: { seo_organic: 0.1, google_ads: 0.06, tiktok_ads: 0.06 },
  app_installs: { meta_ads: 0.1, tiktok_ads: 0.1, youtube_ads: 0.06 },
  local_visits: { google_ads: 0.12, meta_ads: 0.06, seo_organic: 0.08 },
};

/** Rough CPM/CPA priors per channel (in a generic currency unit). */
const CHANNEL_BASE_CPA: Record<ChannelId, number> = {
  google_ads: 18,
  meta_ads: 14,
  linkedin_ads: 45,
  tiktok_ads: 12,
  youtube_ads: 22,
  display_remarketing: 8,
  email: 4,
  seo_organic: 6,
};

function buildSegments(brief: Brief): AudienceSegment[] {
  const rng = seededRng(`${brief.id}:segments`);
  const seedInterests = (brief.audience ?? brief.description)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3)
    .slice(0, 6);

  // Three archetypal segments tuned to the goal: high-intent, warm, broad.
  const archetypes: Array<{ name: string; reach: number; intent: number; tag: string }> = [
    { name: "High-intent searchers", reach: 0.25, intent: 0.9, tag: "ready-to-buy" },
    { name: "Warm prospects / lookalikes", reach: 0.45, intent: 0.55, tag: "considering" },
    { name: "Broad discovery audience", reach: 0.85, intent: 0.3, tag: "awareness" },
  ];

  return archetypes.map((a) =>
    ({
      id: stableId("seg", brief.id, a.tag),
      name: a.name,
      description: `${a.name} for ${brief.product} — ${a.tag} mindset.`,
      reach: round(clamp(a.reach + (rng() - 0.5) * 0.1, 0.05, 1)),
      intent: round(clamp(a.intent + (rng() - 0.5) * 0.08, 0.05, 1)),
      interests: seedInterests.length ? seedInterests : ["general"],
    }) satisfies AudienceSegment,
  );
}

/** A plausible seasonality curve; ecommerce/retail peak in Q4, B2B dips summer. */
function buildSeasonality(brief: Brief): SeasonalityPoint[] {
  const retailPeak = brief.model === "ecommerce" || brief.model === "marketplace";
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    let index = 1;
    if (retailPeak) index = month >= 10 ? 1.4 : month <= 2 ? 0.8 : 1;
    else if (brief.model === "b2b" || brief.model === "saas") index = month === 7 || month === 8 ? 0.75 : month === 1 || month === 9 ? 1.2 : 1;
    return { month, index: round(index) };
  });
}

function buildChannelPotential(brief: Brief): ChannelPotential[] {
  const modelFit = MODEL_CHANNEL_FIT[brief.model];
  const goalBonus = GOAL_CHANNEL_BONUS[brief.goal];
  const tCpa = targetCpa(brief);

  return ALL_CHANNELS
    .map((channel): ChannelPotential => {
      const base = modelFit[channel] ?? 0.3;
      const bonus = goalBonus[channel] ?? 0;
      const fit = round(clamp((base + bonus) * 100, 0, 100));
      const estimatedCpa = round(CHANNEL_BASE_CPA[channel] * (tCpa / 18));
      return {
        channel,
        fit,
        estimatedCpa,
        minDailyBudget: round(Math.max(3, estimatedCpa * 2)),
        rationale: `${channel} fit for a ${brief.model} pursuing ${brief.goal}: base ${Math.round(base * 100)} + goal ${Math.round(bonus * 100)}.`,
      };
    })
    .sort((a, b) => b.fit - a.fit);
}

export function analyzeBrief(brief: Brief): Analysis {
  const assumptions: string[] = [];
  if (!brief.audience) assumptions.push("No audience given — derived 3 archetypal segments from the product description.");
  if (!brief.averageOrderValue || !brief.grossMargin) assumptions.push("AOV/margin missing — target CPA derived from 25% of daily budget.");
  if (!brief.competitors?.length) assumptions.push("No competitors given — competitor angles generalised from category norms.");

  const competitorAngles = (brief.competitors?.length ? brief.competitors : ["incumbent", "cheaper alternative", "DIY / status quo"]).map(
    (c) => `Differentiate from ${c}: lead with ${brief.product}'s clearest concrete outcome, not features.`,
  );

  return {
    briefId: brief.id,
    positioning: `${brief.product} — the ${brief.goal === "leads" ? "fastest way to qualified pipeline" : "clear choice"} for ${brief.audience ?? "your market"}.`,
    segments: buildSegments(brief),
    seasonality: buildSeasonality(brief),
    channelPotential: buildChannelPotential(brief),
    competitorAngles,
    assumptions,
  };
}
