/**
 * Orchestrator — the autonomous growth loop.
 *
 *   ingest → analyze → strategize → create → land → publish →
 *   [ measure → optimize ]×N → report
 *
 * It runs end-to-end with zero external dependencies (dry-run publishing +
 * deterministic metric simulation), which is exactly what the QA / pipeline
 * test exercises. Supply real credentials + human approval to let the publish
 * step talk to official APIs.
 */
import type {
  Analysis,
  Brief,
  ChannelId,
  CreativeVariant,
  DerivedMetrics,
  LandingPage,
  MetricSnapshot,
  OptimizationResult,
  Report,
  Strategy,
} from "./types";
import { ingestBrief } from "./brief";
import { analyzeBrief } from "./analysis";
import { buildStrategy } from "./strategy";
import { generateCreatives } from "./creative";
import { generateLandingPage } from "./landing";
import { publishCampaigns, type ChannelAccount, type PublishPlanResult } from "./publish";
import { derive, mergeSnapshots, simulatePeriod } from "./monitoring";
import { optimize } from "./optimization";
import { buildReport } from "./reporting";
import { thompsonAllocate, type BanditAllocation, type BanditArm } from "./bandit";
import { dailyBudget } from "./brief";
import { enhanceCreativesWithAi } from "./creative-ai";
import { resolveProvider, type AiProvider } from "../ai/provider";

export interface RunConfig {
  baseUrl?: string;
  maxDailyBudget?: number;
  humanApproved?: boolean;
  credentials?: Partial<Record<string, string>>;
  /** Per-channel account config (Meta ad account/page id, target countries…). */
  accounts?: Partial<Record<string, ChannelAccount>>;
  /** Injectable fetch passed to channel adapters (tests / custom transport). */
  fetchImpl?: typeof fetch;
  /** AI provider (copywriter role). Defaults to env resolution (rule-based offline). */
  provider?: AiProvider;
  /** Number of measure→optimize iterations to run. */
  iterations?: number;
  /** Seed for the deterministic simulator. */
  seed?: string;
  /**
   * Real observed metrics to warm-start optimization from (e.g. loaded from a
   * previous run / live platform pull). These seed the cumulative store so the
   * loop optimises against real history, not just simulation.
   */
  priorMetrics?: MetricSnapshot[];
  /**
   * When false, the simulator is disabled and the loop optimises purely on the
   * provided `priorMetrics`. Defaults to true so the demo runs end-to-end.
   */
  simulate?: boolean;
}

export interface LoopIteration {
  index: number;
  metrics: DerivedMetrics[];
  optimization: OptimizationResult;
  /** Budgeted-Thompson-sampling reallocation recommendation for next period. */
  recommendedAllocation: BanditAllocation[];
}

export interface RunResult {
  brief: Brief;
  analysis: Analysis;
  strategy: Strategy;
  creatives: CreativeVariant[];
  landingPages: LandingPage[];
  publish: PublishPlanResult;
  iterations: LoopIteration[];
  report: Report;
  converged: boolean;
}

const DEFAULTS = {
  baseUrl: "https://lp.reklama.local",
  maxDailyBudget: 50,
  humanApproved: false,
  iterations: 3,
  seed: "reklama",
};

export async function runGrowthLoop(input: unknown, config: RunConfig = {}): Promise<RunResult> {
  const cfg = { ...DEFAULTS, ...config };

  // 1. Brief → 2. Analysis → 3. Strategy
  const brief = ingestBrief(input);
  const analysis = analyzeBrief(brief);
  const strategy = buildStrategy(brief, analysis);

  // 4. Creative → 5. Landing (A/B)
  // Copywriter role refines the templates when a real model is configured;
  // a no-op under the deterministic provider so offline runs stay reproducible.
  const provider = cfg.provider ?? resolveProvider();
  const creatives = await enhanceCreativesWithAi(generateCreatives(brief, analysis, strategy), brief, provider);
  const landingPages = [generateLandingPage(brief, analysis, "A"), generateLandingPage(brief, analysis, "B")];

  // 6. Publish (dry-run unless credentials + approval present)
  const publish = await publishCampaigns(brief, strategy, creatives, landingPages, {
    baseUrl: cfg.baseUrl,
    credentials: cfg.credentials,
    accounts: cfg.accounts,
    fetchImpl: cfg.fetchImpl,
    humanApproved: cfg.humanApproved,
    maxDailyBudget: cfg.maxDailyBudget,
    desiredStatus: cfg.humanApproved ? "LIVE" : "DRAFT",
  });

  // 7–8. Measure → Optimize loop
  const iterations: LoopIteration[] = [];
  const cumulative = new Map<string, MetricSnapshot>();
  // Warm-start from real observed metrics so optimization works on history.
  for (const snap of cfg.priorMetrics ?? []) {
    const prev = cumulative.get(snap.variantId);
    cumulative.set(snap.variantId, prev ? mergeSnapshots(prev, snap) : snap);
  }
  const useSimulator = cfg.simulate !== false;
  let converged = false;

  for (let i = 0; i < cfg.iterations; i++) {
    if (useSimulator) {
      const aov = brief.averageOrderValue ?? 60;
      const period = simulatePeriod(creatives, strategy, aov, `${cfg.seed}:${brief.id}:${i}`);
      for (const snap of period) {
        const prev = cumulative.get(snap.variantId);
        cumulative.set(snap.variantId, prev ? mergeSnapshots(prev, snap) : snap);
      }
    }
    const metrics = [...cumulative.values()].map(derive);
    const optimization = optimize({ strategy, metrics, maxDailyBudget: cfg.maxDailyBudget });

    // Research-backed reallocation: roll metrics up to per-channel arms and let
    // a budgeted Thompson-sampling bandit propose next period's budget split.
    const arms = toBanditArms(metrics, strategy.rolloutOrder);
    const recommendedAllocation = thompsonAllocate(arms, {
      totalBudget: Math.min(dailyBudget(brief), cfg.maxDailyBudget * arms.length),
      maxPerChannel: cfg.maxDailyBudget,
      seed: `${cfg.seed}:${brief.id}:bandit:${i}`,
    });

    iterations.push({ index: i, metrics, optimization, recommendedAllocation });
    if (optimization.converged) {
      converged = true;
      break;
    }
  }

  // 9. Report
  const finalMetrics = iterations[iterations.length - 1]?.metrics ?? [];
  const report = buildReport(strategy, finalMetrics);

  return { brief, analysis, strategy, creatives, landingPages, publish, iterations, report, converged };
}

/** Roll per-variant metrics up to one bandit arm per channel. */
function toBanditArms(metrics: DerivedMetrics[], channels: ChannelId[]): BanditArm[] {
  return channels.map((channel) => {
    const rows = metrics.filter((m) => m.channel === channel);
    const clicks = rows.reduce((s, m) => s + m.clicks, 0);
    const conversions = rows.reduce((s, m) => s + m.conversions, 0);
    const spend = rows.reduce((s, m) => s + m.spend, 0);
    const cpc = clicks > 0 ? spend / clicks : 1;
    return { channel, conversions, clicks, cpc };
  });
}
