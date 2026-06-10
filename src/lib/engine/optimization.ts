/**
 * Optimization module — reads derived metrics and decides what to change.
 *
 * Rules (in priority order, matching the decision-logic spec):
 *   1. Safety: flag anomalies (zero conversions on meaningful spend, runaway CPA).
 *   2. Kill losers: pause variants far below target with enough data.
 *   3. Promote winners: when an experiment has a clear, significant leader.
 *   4. Reallocate: scale budget into channels beating KPIs, cut from laggards.
 *   5. Convergence: declare done when KPIs are met and nothing is actionable.
 *
 * Budget moves are bounded by `maxDailyBudget` (the human-set safety ceiling).
 */
import type {
  DerivedMetrics,
  Kpi,
  OptimizationAction,
  OptimizationResult,
  Strategy,
} from "./types";
import { clamp, round, safeDiv } from "./util";

export interface OptimizeInput {
  strategy: Strategy;
  metrics: DerivedMetrics[];
  /** Human-set hard ceiling on any single channel's daily budget. */
  maxDailyBudget: number;
}

function kpiTarget(kpis: Kpi[], name: Kpi["name"]): Kpi | undefined {
  return kpis.find((k) => k.name === name);
}

/** Score a variant against the primary objective (higher = better). */
function objectiveScore(m: DerivedMetrics, strategy: Strategy): number {
  const primary = strategy.kpis[0];
  switch (primary?.name) {
    case "ROAS": return m.roas;
    case "CPA": return m.conversions > 0 ? -m.cpa : -Infinity;
    case "CPC": return -m.cpc;
    case "CTR": return m.ctr;
    case "CPM": return -m.cpm;
    case "LEADS": return m.conversions;
    default: return m.roas;
  }
}

export function optimize(input: OptimizeInput): OptimizationResult {
  const { strategy, metrics, maxDailyBudget } = input;
  const actions: OptimizationAction[] = [];
  const byId = new Map(metrics.map((m) => [m.variantId, m]));

  const roasKpi = kpiTarget(strategy.kpis, "ROAS");
  const cpaKpi = kpiTarget(strategy.kpis, "CPA");

  // 1. Safety — anomalies.
  for (const m of metrics) {
    if (m.spend >= 10 && m.conversions === 0) {
      actions.push({ type: "flag_anomaly", variantId: m.variantId, metric: "conversions", reason: `Spent ${m.spend} with 0 conversions.` });
    }
    if (cpaKpi && m.conversions > 0 && m.cpa > cpaKpi.target * 3) {
      actions.push({ type: "flag_anomaly", variantId: m.variantId, metric: "CPA", reason: `CPA ${m.cpa} is >3× target ${cpaKpi.target}.` });
    }
  }

  // 2 & 3. Per-experiment: kill clear losers, promote significant winners.
  for (const exp of strategy.experiments) {
    const a = byId.get(exp.variantIds[0]);
    const b = byId.get(exp.variantIds[1]);
    if (!a || !b) continue;
    const totalConv = a.conversions + b.conversions;
    const sampleReady = totalConv >= exp.minSampleConversions;

    const sa = objectiveScore(a, strategy);
    const sb = objectiveScore(b, strategy);
    const [winner, loser, ws, ls] = sa >= sb ? [a, b, sa, sb] : [b, a, sb, sa];

    if (sampleReady && ls !== 0 && Math.abs((ws - ls) / (Math.abs(ls) || 1)) > 0.2) {
      actions.push({ type: "promote_winner", experimentId: exp.id, winnerVariantId: winner.variantId, reason: `${exp.primaryKpi}: winner ${round(ws, 3)} vs ${round(ls, 3)} (≥20% gap, n=${totalConv}).` });
      actions.push({ type: "pause_variant", variantId: loser.variantId, reason: `Lost experiment ${exp.id} on ${exp.primaryKpi}.` });
    } else if (sampleReady && (loser.conversions === 0 || objectiveScore(loser, strategy) < 0)) {
      actions.push({ type: "pause_variant", variantId: loser.variantId, reason: `Underperformer with sufficient data (n=${totalConv}).` });
    } else if (!sampleReady) {
      // Not enough data yet → consider fresh creative only if truly dead.
      if (a.clicks + b.clicks > 200 && totalConv === 0) {
        actions.push({ type: "request_new_creative", segmentId: "primary", channel: a.channel, reason: `200+ clicks, 0 conversions — creative/offer mismatch.` });
      }
    }
  }

  // 4. Reallocate budget across channels by ROAS (bounded by the safety ceiling).
  const channelRoas = new Map<string, { spend: number; revenue: number }>();
  for (const m of metrics) {
    const cur = channelRoas.get(m.channel) ?? { spend: 0, revenue: 0 };
    cur.spend += m.spend;
    cur.revenue += m.revenue;
    channelRoas.set(m.channel, cur);
  }
  for (const alloc of strategy.allocations) {
    const agg = channelRoas.get(alloc.channel);
    if (!agg || agg.spend < 5) continue;
    const roas = safeDiv(agg.revenue, agg.spend);
    const target = roasKpi?.target ?? 2;
    if (roas >= target * 1.2) {
      const to = clamp(round(alloc.dailyBudget * 1.3), 0, maxDailyBudget);
      if (to > alloc.dailyBudget) actions.push({ type: "scale_budget", channel: alloc.channel, from: alloc.dailyBudget, to, reason: `ROAS ${round(roas, 2)} ≥ 1.2× target — scale up (capped at ${maxDailyBudget}).` });
    } else if (roas < target * 0.6) {
      const to = round(alloc.dailyBudget * 0.6);
      actions.push({ type: "cut_budget", channel: alloc.channel, from: alloc.dailyBudget, to, reason: `ROAS ${round(roas, 2)} < 0.6× target — cut spend.` });
    }
  }

  // 5. Convergence: KPIs met and no destructive actions left to take.
  const converged = isConverged(strategy.kpis, metrics) && !actions.some((a) => a.type === "pause_variant" || a.type === "cut_budget" || a.type === "flag_anomaly");
  if (actions.length === 0) actions.push({ type: "hold", reason: converged ? "KPIs met; performance stable." : "No statistically actionable change this period." });

  return { actions, converged };
}

/** KPIs are met when every target is satisfied across the aggregate. */
export function isConverged(kpis: Kpi[], metrics: DerivedMetrics[]): boolean {
  if (metrics.length === 0) return false;
  const agg = aggregate(metrics);
  return kpis.every((k) => {
    const actual = actualFor(k.name, agg);
    if (k.target === 0) return actual > 0; // open targets (LEADS/CPA-floor) just need movement
    return k.higherIsBetter ? actual >= k.target : actual <= k.target;
  });
}

export function aggregate(metrics: DerivedMetrics[]): DerivedMetrics {
  const sum = metrics.reduce(
    (s, m) => ({
      impressions: s.impressions + m.impressions,
      clicks: s.clicks + m.clicks,
      spend: s.spend + m.spend,
      conversions: s.conversions + m.conversions,
      revenue: s.revenue + m.revenue,
    }),
    { impressions: 0, clicks: 0, spend: 0, conversions: 0, revenue: 0 },
  );
  return {
    variantId: "AGGREGATE",
    channel: "google_ads",
    ...sum,
    bounceRate: 0,
    timeOnPage: 0,
    scrollDepth: 0,
    ctr: round(safeDiv(sum.clicks, sum.impressions), 4),
    cpc: round(safeDiv(sum.spend, sum.clicks)),
    cpa: round(safeDiv(sum.spend, sum.conversions)),
    roas: round(safeDiv(sum.revenue, sum.spend)),
    cvr: round(safeDiv(sum.conversions, sum.clicks), 4),
    cpm: round(safeDiv(sum.spend * 1000, sum.impressions)),
  };
}

function actualFor(name: Kpi["name"], agg: DerivedMetrics): number {
  switch (name) {
    case "ROAS": return agg.roas;
    case "CPA": return agg.cpa;
    case "CPC": return agg.cpc;
    case "CTR": return agg.ctr;
    case "CVR": return agg.cvr;
    case "CPM": return agg.cpm;
    case "LEADS": return agg.conversions;
  }
}
