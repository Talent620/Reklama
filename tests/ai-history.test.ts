import { describe, it, expect } from "vitest";
import { runGrowthLoop, enhanceCreativesWithAi } from "@/lib/engine";
import { RuleBasedProvider, type AiProvider } from "@/lib/ai/provider";
import { ingestBrief } from "@/lib/engine/brief";
import { analyzeBrief } from "@/lib/engine/analysis";
import { buildStrategy } from "@/lib/engine/strategy";
import { generateCreatives } from "@/lib/engine/creative";
import type { MetricSnapshot } from "@/lib/engine";

const BRIEF = {
  company: "Brewly", product: "Brewly Cold Brew Kit",
  description: "Barista-grade cold brew at home in 5 minutes.",
  model: "ecommerce" as const, goal: "sales" as const, currency: "PLN",
  monthlyBudget: 6000, averageOrderValue: 120, grossMargin: 0.6,
};

/** A fake "claude" provider that uppercases the headline, to prove it's used. */
class FakeClaude implements AiProvider {
  readonly name = "claude" as const;
  async complete() {
    return { text: '{"headline":"REWRITTEN HEADLINE","primaryText":"Rewritten body copy.","cta":"Buy now"}', provider: "claude" as const, model: "fake" };
  }
}

describe("AI copywriter role", () => {
  it("is a no-op under the deterministic rule-based provider", async () => {
    const brief = ingestBrief(BRIEF);
    const analysis = analyzeBrief(brief);
    const strategy = buildStrategy(brief, analysis);
    const creatives = generateCreatives(brief, analysis, strategy);
    const enhanced = await enhanceCreativesWithAi(creatives, brief, new RuleBasedProvider());
    expect(enhanced).toEqual(creatives);
  });

  it("rewrites copy under a real provider but re-enforces headline caps", async () => {
    const brief = ingestBrief(BRIEF);
    const analysis = analyzeBrief(brief);
    const strategy = buildStrategy(brief, analysis);
    const creatives = generateCreatives(brief, analysis, strategy);
    const enhanced = await enhanceCreativesWithAi(creatives, brief, new FakeClaude());
    expect(enhanced[0].primaryText).toBe("Rewritten body copy.");
    // Google search headlines still respect the 30-char cap after rewrite.
    for (const c of enhanced.filter((x) => x.channel === "google_ads")) {
      expect(c.headline.length).toBeLessThanOrEqual(30);
    }
  });

  it("falls back to the original creative when the model returns garbage", async () => {
    const brief = ingestBrief(BRIEF);
    const analysis = analyzeBrief(brief);
    const strategy = buildStrategy(brief, analysis);
    const creatives = generateCreatives(brief, analysis, strategy);
    const garbage: AiProvider = { name: "claude", async complete() { return { text: "not json at all", provider: "claude", model: "x" }; } };
    const enhanced = await enhanceCreativesWithAi(creatives, brief, garbage);
    expect(enhanced[0].headline).toBe(creatives[0].headline);
  });
});

describe("history-based optimization", () => {
  it("optimises on provided real metrics with the simulator disabled", async () => {
    const brief = ingestBrief(BRIEF);
    const analysis = analyzeBrief(brief);
    const strategy = buildStrategy(brief, analysis);
    // Real history: variant A great, variant B wasted spend → expect a pause/anomaly.
    const channel = strategy.rolloutOrder[0];
    const priorMetrics: MetricSnapshot[] = [
      { variantId: strategy.experiments[0].variantIds[0], channel, impressions: 6000, clicks: 300, spend: 120, conversions: 40, revenue: 5000, bounceRate: 0.3, timeOnPage: 60, scrollDepth: 0.8 },
      { variantId: strategy.experiments[0].variantIds[1], channel, impressions: 6000, clicks: 280, spend: 110, conversions: 0, revenue: 0, bounceRate: 0.8, timeOnPage: 6, scrollDepth: 0.1 },
    ];
    const result = await runGrowthLoop(BRIEF, { iterations: 1, simulate: false, priorMetrics, seed: "hist" });
    const actions = result.iterations[0].optimization.actions;
    // The wasted-spend variant should be flagged or paused.
    expect(actions.some((a) => a.type === "flag_anomaly" || a.type === "pause_variant")).toBe(true);
    // Metrics reflect the real history we fed in (not simulation).
    expect(result.iterations[0].metrics.reduce((s, m) => s + m.conversions, 0)).toBe(40);
  });
});
