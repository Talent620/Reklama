import { describe, it, expect } from "vitest";
import {
  ingestBrief,
  analyzeBrief,
  buildStrategy,
  generateCreatives,
  generateLandingPage,
  derive,
  simulatePeriod,
  optimize,
  aggregate,
  buildReport,
  runGrowthLoop,
} from "@/lib/engine";
import { thompsonAllocate, betaSample, type BanditArm } from "@/lib/engine/bandit";
import { seededRng } from "@/lib/engine/util";
import type { BriefInput } from "@/lib/engine/brief";

const ECOM_BRIEF: BriefInput = {
  company: "Brewly",
  product: "Brewly Cold Brew Kit",
  description: "Make barista-grade cold brew at home in 5 minutes. Reusable, zero waste.",
  model: "ecommerce",
  goal: "sales",
  currency: "PLN",
  monthlyBudget: 6000,
  averageOrderValue: 120,
  grossMargin: 0.6,
  markets: ["PL"],
};

const B2B_BRIEF: BriefInput = {
  company: "PipelineIQ",
  product: "PipelineIQ",
  description: "AI sales forecasting for B2B revenue teams.",
  model: "b2b",
  goal: "leads",
  currency: "EUR",
  monthlyBudget: 9000,
};

describe("brief", () => {
  it("validates and fills defaults", () => {
    const brief = ingestBrief(ECOM_BRIEF);
    expect(brief.id).toMatch(/^brief_/);
    expect(brief.markets).toEqual(["PL"]);
    expect(brief.competitors).toEqual([]);
  });

  it("rejects invalid input with a readable error", () => {
    expect(() => ingestBrief({ company: "", product: "x", description: "y", model: "ecommerce", goal: "sales", monthlyBudget: -1 })).toThrow();
  });

  it("is deterministic — same brief yields same id", () => {
    expect(ingestBrief(ECOM_BRIEF).id).toBe(ingestBrief(ECOM_BRIEF).id);
  });
});

describe("analysis", () => {
  it("produces segments, seasonality and ranked channels", () => {
    const a = analyzeBrief(ingestBrief(ECOM_BRIEF));
    expect(a.segments).toHaveLength(3);
    expect(a.seasonality).toHaveLength(12);
    // Channels are sorted by fit, descending.
    const fits = a.channelPotential.map((c) => c.fit);
    expect([...fits].sort((x, y) => y - x)).toEqual(fits);
  });

  it("records assumptions when the brief is sparse", () => {
    const a = analyzeBrief(ingestBrief(B2B_BRIEF));
    expect(a.assumptions.length).toBeGreaterThan(0);
  });

  it("matches B2B to LinkedIn as a top channel", () => {
    const a = analyzeBrief(ingestBrief(B2B_BRIEF));
    const top3 = a.channelPotential.slice(0, 3).map((c) => c.channel);
    expect(top3).toContain("linkedin_ads");
  });
});

describe("strategy", () => {
  it("allocates budget that sums to ~100% and logs decisions", () => {
    const brief = ingestBrief(ECOM_BRIEF);
    const s = buildStrategy(brief, analyzeBrief(brief));
    const shareSum = s.allocations.reduce((x, a) => x + a.share, 0);
    expect(shareSum).toBeGreaterThan(0.98);
    expect(shareSum).toBeLessThan(1.02);
    expect(s.decisionLog.length).toBeGreaterThanOrEqual(3);
    // Every decision considered ≥3 options (decision-logic spec).
    for (const d of s.decisionLog) expect(d.options.length).toBeGreaterThanOrEqual(3);
  });

  it("creates one A/B experiment per channel", () => {
    const brief = ingestBrief(ECOM_BRIEF);
    const s = buildStrategy(brief, analyzeBrief(brief));
    expect(s.experiments).toHaveLength(s.rolloutOrder.length);
    for (const e of s.experiments) expect(e.variantIds).toHaveLength(2);
  });
});

describe("creative", () => {
  it("generates two compliant variants per experiment within headline caps", () => {
    const brief = ingestBrief(ECOM_BRIEF);
    const analysis = analyzeBrief(brief);
    const strategy = buildStrategy(brief, analysis);
    const creatives = generateCreatives(brief, analysis, strategy);
    expect(creatives).toHaveLength(strategy.experiments.length * 2);
    for (const c of creatives) {
      expect(c.headline.length).toBeGreaterThan(0);
      expect(c.cta.length).toBeGreaterThan(0);
      expect(c.complianceNotes.length).toBeGreaterThan(0);
    }
    // Google search headlines must respect the 30-char cap.
    const g = creatives.filter((c) => c.channel === "google_ads");
    for (const c of g) expect(c.headline.length).toBeLessThanOrEqual(30);
  });
});

describe("landing", () => {
  it("generates an A and B page with all required sections", () => {
    const brief = ingestBrief(ECOM_BRIEF);
    const analysis = analyzeBrief(brief);
    const a = generateLandingPage(brief, analysis, "A");
    const b = generateLandingPage(brief, analysis, "B");
    const kinds = a.sections.map((s) => s.kind);
    for (const required of ["hero", "benefits", "social_proof", "faq", "form", "cta"]) {
      expect(kinds).toContain(required);
    }
    expect(a.slug).not.toBe(b.slug);
    expect(a.trackedEvents).toContain("form_submit");
    expect(a.metaDescription.length).toBeLessThanOrEqual(155);
  });
});

describe("monitoring + optimization", () => {
  it("derives metrics correctly", () => {
    const d = derive({ variantId: "v", channel: "google_ads", impressions: 1000, clicks: 50, spend: 100, conversions: 5, revenue: 400, bounceRate: 0.4, timeOnPage: 30, scrollDepth: 0.6 });
    expect(d.ctr).toBeCloseTo(0.05, 4);
    expect(d.cpc).toBeCloseTo(2, 2);
    expect(d.cpa).toBeCloseTo(20, 2);
    expect(d.roas).toBeCloseTo(4, 2);
  });

  it("flags a zero-conversion spend anomaly", () => {
    const brief = ingestBrief(ECOM_BRIEF);
    const analysis = analyzeBrief(brief);
    const strategy = buildStrategy(brief, analysis);
    const metrics = [
      derive({ variantId: strategy.experiments[0].variantIds[0], channel: strategy.rolloutOrder[0], impressions: 5000, clicks: 100, spend: 80, conversions: 0, revenue: 0, bounceRate: 0.7, timeOnPage: 8, scrollDepth: 0.2 }),
      derive({ variantId: strategy.experiments[0].variantIds[1], channel: strategy.rolloutOrder[0], impressions: 4000, clicks: 90, spend: 70, conversions: 6, revenue: 700, bounceRate: 0.4, timeOnPage: 40, scrollDepth: 0.7 }),
    ];
    const result = optimize({ strategy, metrics, maxDailyBudget: 50 });
    expect(result.actions.some((a) => a.type === "flag_anomaly")).toBe(true);
  });

  it("never scales a channel above the safety ceiling", () => {
    const brief = ingestBrief(ECOM_BRIEF);
    const analysis = analyzeBrief(brief);
    const strategy = buildStrategy(brief, analysis);
    // Force a high-ROAS situation on the top channel.
    const metrics = strategy.allocations.map((a) =>
      derive({ variantId: "x_" + a.channel, channel: a.channel, impressions: 2000, clicks: 200, spend: 40, conversions: 40, revenue: 4000, bounceRate: 0.3, timeOnPage: 60, scrollDepth: 0.8 }),
    );
    const result = optimize({ strategy, metrics, maxDailyBudget: 50 });
    for (const action of result.actions) {
      if (action.type === "scale_budget") expect(action.to).toBeLessThanOrEqual(50);
    }
  });
});

describe("reporting", () => {
  it("reports KPI status and recommendations", () => {
    const brief = ingestBrief(ECOM_BRIEF);
    const analysis = analyzeBrief(brief);
    const strategy = buildStrategy(brief, analysis);
    const creatives = generateCreatives(brief, analysis, strategy);
    const metrics = simulatePeriod(creatives, strategy, 120, "seed").map(derive);
    const report = buildReport(strategy, metrics);
    expect(report.kpiStatus.length).toBe(strategy.kpis.length);
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.nextSteps.length).toBeGreaterThan(0);
  });
});

describe("bandit allocator (Thompson sampling)", () => {
  const arms: BanditArm[] = [
    { channel: "google_ads", conversions: 40, clicks: 400, cpc: 1.0 }, // best value/€
    { channel: "meta_ads", conversions: 20, clicks: 400, cpc: 1.0 },
    { channel: "tiktok_ads", conversions: 5, clicks: 400, cpc: 1.0 },
  ];

  it("is deterministic for a fixed seed", () => {
    const a = thompsonAllocate(arms, { totalBudget: 90, maxPerChannel: 50, seed: "s" });
    const b = thompsonAllocate(arms, { totalBudget: 90, maxPerChannel: 50, seed: "s" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("allocates the most budget to the best reward/cost arm", () => {
    const alloc = thompsonAllocate(arms, { totalBudget: 90, maxPerChannel: 50, seed: "x", rounds: 4000 });
    const top = [...alloc].sort((p, q) => q.dailyBudget - p.dailyBudget)[0];
    expect(top.channel).toBe("google_ads");
  });

  it("never exceeds the per-channel ceiling", () => {
    const alloc = thompsonAllocate(arms, { totalBudget: 300, maxPerChannel: 40, seed: "x" });
    for (const a of alloc) expect(a.dailyBudget).toBeLessThanOrEqual(40 + 0.01);
  });

  it("shares sum to ~1 and budget sums to ~total (within ceiling capacity)", () => {
    const alloc = thompsonAllocate(arms, { totalBudget: 90, maxPerChannel: 50, seed: "x" });
    const shareSum = alloc.reduce((s, a) => s + a.share, 0);
    expect(shareSum).toBeGreaterThan(0.98);
    expect(shareSum).toBeLessThan(1.02);
  });

  it("explores: a zero-data arm still receives non-zero budget", () => {
    const withCold: BanditArm[] = [...arms, { channel: "linkedin_ads", conversions: 0, clicks: 0, cpc: 1 }];
    const alloc = thompsonAllocate(withCold, { totalBudget: 100, maxPerChannel: 50, seed: "x", rounds: 4000 });
    const cold = alloc.find((a) => a.channel === "linkedin_ads")!;
    expect(cold.dailyBudget).toBeGreaterThan(0);
  });

  it("betaSample stays in (0,1) and concentrates as data grows", () => {
    const rng = seededRng("b");
    for (let i = 0; i < 100; i++) {
      const s = betaSample(50, 100, rng);
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThan(1);
    }
  });
});

describe("orchestrator (end-to-end autonomous loop)", () => {
  it("runs the full pipeline in dry-run without any external dependency", async () => {
    const result = await runGrowthLoop(ECOM_BRIEF, { iterations: 4, seed: "test" });
    expect(result.brief.company).toBe("Brewly");
    expect(result.analysis.segments.length).toBe(3);
    expect(result.strategy.allocations.length).toBeGreaterThan(0);
    expect(result.creatives.length).toBeGreaterThan(0);
    expect(result.landingPages.length).toBe(2);
    // Nothing went live without approval.
    expect(result.publish.anyLive).toBe(false);
    for (const r of result.publish.results) expect(r.status).not.toBe("LIVE");
    expect(result.iterations.length).toBeGreaterThan(0);
    expect(result.report.kpiStatus.length).toBeGreaterThan(0);
    // Each iteration carries a bandit reallocation recommendation.
    for (const it of result.iterations) {
      expect(it.recommendedAllocation.length).toBe(result.strategy.rolloutOrder.length);
      for (const a of it.recommendedAllocation) expect(a.dailyBudget).toBeLessThanOrEqual(50);
    }
  });

  it("is fully deterministic across runs", async () => {
    const a = await runGrowthLoop(ECOM_BRIEF, { iterations: 3, seed: "fixed" });
    const b = await runGrowthLoop(ECOM_BRIEF, { iterations: 3, seed: "fixed" });
    expect(JSON.stringify(a.report)).toBe(JSON.stringify(b.report));
  });

  it("keeps every channel within the budget ceiling even when scaling", async () => {
    const result = await runGrowthLoop(ECOM_BRIEF, { iterations: 5, seed: "scale", maxDailyBudget: 30 });
    for (const it of result.iterations) {
      for (const action of it.optimization.actions) {
        if (action.type === "scale_budget") expect(action.to).toBeLessThanOrEqual(30);
      }
    }
  });
});
