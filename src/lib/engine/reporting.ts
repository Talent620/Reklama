/**
 * Reporting module — summarises a run into KPI status, top variants,
 * insights, recommendations, and next steps.
 */
import type { DerivedMetrics, Report, Strategy } from "./types";
import { aggregate } from "./optimization";
import { round } from "./util";

export function buildReport(
  strategy: Strategy,
  metrics: DerivedMetrics[],
  opts: { generatedAt?: string } = {},
): Report {
  const agg = aggregate(metrics);
  const kpiStatus = strategy.kpis.map((k) => {
    const actual = actualFor(k.name, agg);
    const met = k.target === 0 ? actual > 0 : k.higherIsBetter ? actual >= k.target : actual <= k.target;
    return { kpi: k.name, target: k.target, actual: round(actual, 3), met };
  });

  const topVariants = [...metrics]
    .filter((m) => m.spend > 0)
    .sort((a, b) => b.roas - a.roas || a.cpa - b.cpa)
    .slice(0, 5)
    .map((m) => ({ variantId: m.variantId, channel: m.channel, roas: m.roas, cpa: m.cpa }));

  const insights: string[] = [];
  if (agg.roas > 0) insights.push(`Blended ROAS is ${agg.roas} on ${round(agg.spend)} spend (${agg.conversions} conversions).`);
  const bestChannel = topVariants[0];
  if (bestChannel) insights.push(`Best performer: ${bestChannel.channel} (ROAS ${bestChannel.roas}, CPA ${bestChannel.cpa}).`);
  const zeroConv = metrics.filter((m) => m.spend >= 10 && m.conversions === 0);
  if (zeroConv.length) insights.push(`${zeroConv.length} variant(s) spent without converting — paused/flagged by optimizer.`);

  const recommendations: string[] = [];
  const failing = kpiStatus.filter((k) => !k.met);
  if (failing.length === 0) recommendations.push("All KPIs met — scale the winning channel and start a new creative experiment to keep improving.");
  else failing.forEach((k) => recommendations.push(`${k.kpi} is ${k.actual} vs target ${k.target} — ${recoFor(k.kpi)}.`));

  const nextSteps = [
    "Promote experiment winners; pause losers.",
    "Reallocate budget toward the highest-ROAS channel (within the safety ceiling).",
    "Generate a fresh creative variant for the weakest segment.",
    "Re-run the loop next period and compare deltas.",
  ];

  return {
    briefId: strategy.briefId,
    generatedAt: opts.generatedAt ?? new Date(0).toISOString(),
    summary: failing.length === 0
      ? `Run met all ${strategy.kpis.length} KPI targets. Recommend scaling.`
      : `Run met ${kpiStatus.length - failing.length}/${kpiStatus.length} KPIs. Optimizing the rest.`,
    kpiStatus,
    topVariants,
    insights,
    recommendations,
    nextSteps,
  };
}

function recoFor(kpi: string): string {
  switch (kpi) {
    case "ROAS": return "tighten targeting and raise bids only on converting segments";
    case "CPA": return "pause high-CPA creatives and shift budget to the best variant";
    case "CTR": return "test a stronger hook/headline and a more relevant image";
    case "CVR": return "run a landing-page A/B (the page, not the ad, is the bottleneck)";
    default: return "iterate creative and targeting";
  }
}

function actualFor(name: string, agg: DerivedMetrics): number {
  switch (name) {
    case "ROAS": return agg.roas;
    case "CPA": return agg.cpa;
    case "CPC": return agg.cpc;
    case "CTR": return agg.ctr;
    case "CVR": return agg.cvr;
    case "CPM": return agg.cpm;
    case "LEADS": return agg.conversions;
    default: return 0;
  }
}
