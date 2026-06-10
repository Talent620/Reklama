/**
 * Monitoring module — derives KPIs from raw snapshots and (for environments
 * without live data) simulates plausible performance deterministically so the
 * optimization loop has something to act on.
 *
 * The simulator is clearly labelled and only used when no real metrics exist;
 * it never overwrites real platform data.
 */
import type {
  CreativeVariant,
  DerivedMetrics,
  MetricSnapshot,
  Strategy,
} from "./types";
import { round, safeDiv, seededRng } from "./util";

export function derive(snapshot: MetricSnapshot): DerivedMetrics {
  return {
    ...snapshot,
    ctr: round(safeDiv(snapshot.clicks, snapshot.impressions), 4),
    cpc: round(safeDiv(snapshot.spend, snapshot.clicks)),
    cpa: round(safeDiv(snapshot.spend, snapshot.conversions)),
    roas: round(safeDiv(snapshot.revenue, snapshot.spend)),
    cvr: round(safeDiv(snapshot.conversions, snapshot.clicks), 4),
    cpm: round(safeDiv(snapshot.spend * 1000, snapshot.impressions)),
  };
}

/**
 * Deterministically simulate one period of performance for each variant.
 * Variant A (index 0 in an experiment) is given a modest edge so experiments
 * produce a learnable signal. Output is reproducible for a given seed.
 */
export function simulatePeriod(
  variants: CreativeVariant[],
  strategy: Strategy,
  avgOrderValue: number,
  seed: string,
): MetricSnapshot[] {
  const rng = seededRng(seed);
  const allocByChannel = new Map(strategy.allocations.map((a) => [a.channel, a.dailyBudget]));

  return variants.map((v, i) => {
    const dailyBudget = allocByChannel.get(v.channel) ?? 5;
    // Split channel budget across its variants.
    const variantsOnChannel = variants.filter((x) => x.channel === v.channel).length || 1;
    const spend = round((dailyBudget / variantsOnChannel) * (0.85 + rng() * 0.3));

    const baseCtr = 0.012 + rng() * 0.02;
    const isOutcomeLed = i % 2 === 0; // variant A in each pair
    const ctr = baseCtr * (isOutcomeLed ? 1.15 : 1);
    const cpc = 0.4 + rng() * 1.6;
    const clicks = Math.max(0, Math.round(spend / cpc));
    const impressions = Math.max(clicks, Math.round(safeDiv(clicks, ctr)));
    const cvr = 0.02 + rng() * 0.04 * (isOutcomeLed ? 1.1 : 0.95);
    const conversions = Math.max(0, Math.round(clicks * cvr));
    const revenue = round(conversions * avgOrderValue * (0.9 + rng() * 0.4));

    return {
      variantId: v.id,
      channel: v.channel,
      impressions,
      clicks,
      spend,
      conversions,
      revenue,
      bounceRate: round(0.35 + rng() * 0.3, 3),
      timeOnPage: round(25 + rng() * 90),
      scrollDepth: round(0.4 + rng() * 0.5, 3),
    };
  });
}

/** Aggregate two snapshots for the same variant (e.g. across periods). */
export function mergeSnapshots(a: MetricSnapshot, b: MetricSnapshot): MetricSnapshot {
  return {
    variantId: a.variantId,
    channel: a.channel,
    impressions: a.impressions + b.impressions,
    clicks: a.clicks + b.clicks,
    spend: round(a.spend + b.spend),
    conversions: a.conversions + b.conversions,
    revenue: round(a.revenue + b.revenue),
    bounceRate: round((a.bounceRate + b.bounceRate) / 2, 3),
    timeOnPage: round((a.timeOnPage + b.timeOnPage) / 2),
    scrollDepth: round((a.scrollDepth + b.scrollDepth) / 2, 3),
  };
}
