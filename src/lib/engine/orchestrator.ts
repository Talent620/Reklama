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
import { publishCampaigns, type PublishPlanResult } from "./publish";
import { derive, mergeSnapshots, simulatePeriod } from "./monitoring";
import { optimize } from "./optimization";
import { buildReport } from "./reporting";

export interface RunConfig {
  baseUrl?: string;
  maxDailyBudget?: number;
  humanApproved?: boolean;
  credentials?: Partial<Record<string, string>>;
  /** Number of measure→optimize iterations to run. */
  iterations?: number;
  /** Seed for the deterministic simulator. */
  seed?: string;
}

export interface LoopIteration {
  index: number;
  metrics: DerivedMetrics[];
  optimization: OptimizationResult;
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
  const creatives = generateCreatives(brief, analysis, strategy);
  const landingPages = [generateLandingPage(brief, analysis, "A"), generateLandingPage(brief, analysis, "B")];

  // 6. Publish (dry-run unless credentials + approval present)
  const publish = await publishCampaigns(brief, strategy, creatives, landingPages, {
    baseUrl: cfg.baseUrl,
    credentials: cfg.credentials,
    humanApproved: cfg.humanApproved,
    maxDailyBudget: cfg.maxDailyBudget,
    desiredStatus: cfg.humanApproved ? "LIVE" : "DRAFT",
  });

  // 7–8. Measure → Optimize loop
  const iterations: LoopIteration[] = [];
  const cumulative = new Map<string, MetricSnapshot>();
  let converged = false;

  for (let i = 0; i < cfg.iterations; i++) {
    const aov = brief.averageOrderValue ?? 60;
    const period = simulatePeriod(creatives, strategy, aov, `${cfg.seed}:${brief.id}:${i}`);
    for (const snap of period) {
      const prev = cumulative.get(snap.variantId);
      cumulative.set(snap.variantId, prev ? mergeSnapshots(prev, snap) : snap);
    }
    const metrics = [...cumulative.values()].map(derive);
    const optimization = optimize({ strategy, metrics, maxDailyBudget: cfg.maxDailyBudget });
    iterations.push({ index: i, metrics, optimization });
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
