/**
 * Strategy module — converts analysis into an executable plan.
 *
 * Responsibilities:
 *   - pick the channel mix (top-fit channels that clear a quality bar)
 *   - allocate the daily budget across them, weighted by fit & inverse CPA
 *   - set KPI targets derived from the brief economics
 *   - define A/B experiments per channel
 *   - log every decision with the alternatives considered (decision-logic spec)
 */
import type {
  Analysis,
  Brief,
  BudgetAllocation,
  ChannelId,
  Decision,
  Experiment,
  Kpi,
  Strategy,
} from "./types";
import { dailyBudget, targetCpa } from "./brief";
import { round, safeDiv, stableId } from "./util";

const GOAL_KPIS: Record<Brief["goal"], Kpi[]> = {
  sales: [
    { name: "ROAS", target: 3, higherIsBetter: true },
    { name: "CPA", target: 0, higherIsBetter: false },
    { name: "CVR", target: 0.02, higherIsBetter: true },
  ],
  leads: [
    { name: "CPA", target: 0, higherIsBetter: false },
    { name: "LEADS", target: 0, higherIsBetter: true },
    { name: "CTR", target: 0.02, higherIsBetter: true },
  ],
  brand_awareness: [
    { name: "CPM", target: 12, higherIsBetter: false },
    { name: "CTR", target: 0.01, higherIsBetter: true },
  ],
  traffic: [
    { name: "CPC", target: 0, higherIsBetter: false },
    { name: "CTR", target: 0.025, higherIsBetter: true },
  ],
  app_installs: [
    { name: "CPA", target: 0, higherIsBetter: false },
    { name: "CTR", target: 0.02, higherIsBetter: true },
  ],
  local_visits: [
    { name: "CPA", target: 0, higherIsBetter: false },
    { name: "CTR", target: 0.03, higherIsBetter: true },
  ],
};

function buildKpis(brief: Brief): Kpi[] {
  const tCpa = round(targetCpa(brief));
  return GOAL_KPIS[brief.goal].map((k) => (k.name === "CPA" || k.name === "LEADS" ? { ...k, target: k.name === "CPA" ? tCpa : Math.max(1, Math.floor(dailyBudget(brief) / tCpa)) } : k));
}

/**
 * Pick channels: start from the highest-fit, keep those above the bar, and
 * cap the count so each channel gets enough budget to produce signal.
 */
function selectChannels(brief: Brief, analysis: Analysis, decisions: Decision[]): ChannelId[] {
  const ranked = analysis.channelPotential;
  const budget = dailyBudget(brief);

  // How many channels can we fund above their minimum signal threshold?
  let affordable = 0;
  let running = 0;
  for (const cp of ranked) {
    running += cp.minDailyBudget;
    if (running <= budget && cp.fit >= 55) affordable++;
    else break;
  }
  const maxChannels = Math.max(1, Math.min(4, affordable || 1));
  const chosen = ranked.slice(0, maxChannels).map((c) => c.channel);

  decisions.push({
    question: "Which channels should we launch first?",
    options: [
      "Single best-fit channel (max signal, min diversification)",
      `Top ${maxChannels} channels by fit within budget (chosen)`,
      "All channels above 30 fit (max reach, thin budgets)",
    ],
    chosen: `Top ${maxChannels}: ${chosen.join(", ")}`,
    rationale: `Daily budget ${round(budget)} ${brief.currency} funds ${maxChannels} channel(s) above their minimum signal threshold while keeping each test statistically meaningful.`,
  });

  return chosen;
}

function allocateBudget(brief: Brief, analysis: Analysis, channels: ChannelId[], decisions: Decision[]): BudgetAllocation[] {
  const budget = dailyBudget(brief);
  const potentialByChannel = new Map(analysis.channelPotential.map((c) => [c.channel, c]));

  // Weight = fit / estimatedCPA → reward high fit and cheap conversions.
  const weights = channels.map((ch) => {
    const cp = potentialByChannel.get(ch)!;
    return { ch, w: safeDiv(cp.fit, cp.estimatedCpa) };
  });
  const totalW = weights.reduce((s, x) => s + x.w, 0) || 1;

  const allocations = weights.map(({ ch, w }) => {
    const share = w / totalW;
    return { channel: ch, dailyBudget: round(budget * share), share: round(share, 3) } satisfies BudgetAllocation;
  });

  decisions.push({
    question: "How should the daily budget be split?",
    options: ["Equal split across channels", "Weighted by fit ÷ estimated CPA (chosen)", "All-in on the single top channel"],
    chosen: allocations.map((a) => `${a.channel} ${Math.round(a.share * 100)}%`).join(", "),
    rationale: "Fit-over-CPA weighting concentrates spend where each unit is most likely to convert profitably, without starving secondary channels of signal.",
  });

  return allocations;
}

function buildExperiments(brief: Brief, channels: ChannelId[]): Experiment[] {
  const primaryKpi = GOAL_KPIS[brief.goal][0].name;
  // Each channel runs an A/B on creative angle; winner promoted by optimization.
  return channels.map((ch) => ({
    id: stableId("exp", brief.id, ch),
    hypothesis: `On ${ch}, an outcome-led headline beats a feature-led headline on ${primaryKpi}.`,
    variantIds: [stableId("var", brief.id, ch, "A"), stableId("var", brief.id, ch, "B")],
    primaryKpi,
    minSampleConversions: 25,
  }));
}

export function buildStrategy(brief: Brief, analysis: Analysis): Strategy {
  const decisions: Decision[] = [];
  const channels = selectChannels(brief, analysis, decisions);
  const allocations = allocateBudget(brief, analysis, channels, decisions);
  const kpis = buildKpis(brief);

  decisions.push({
    question: "What is the primary objective to optimise toward?",
    options: ["Maximise reach", "Maximise conversions/ROAS at target CPA (chosen)", "Minimise CPC"],
    chosen: `Optimise for ${brief.goal} at target CPA ${round(targetCpa(brief))} ${brief.currency}`,
    rationale: "Objective inherited directly from the brief goal; KPI targets derived from unit economics so the loop can declare convergence objectively.",
  });

  return {
    briefId: brief.id,
    objective: brief.goal,
    kpis,
    allocations,
    rolloutOrder: channels,
    experiments: buildExperiments(brief, channels),
    decisionLog: decisions,
  };
}
