import { describe, it, expect, vi } from "vitest";
import { MetaMarketingClient, metaObjective, metaCtaType } from "@/lib/engine/channels/meta-client";
import { MetaAdsAdapter } from "@/lib/engine/channels/meta";
import { publishCampaigns } from "@/lib/engine/publish";
import { ingestBrief } from "@/lib/engine/brief";
import { analyzeBrief } from "@/lib/engine/analysis";
import { buildStrategy } from "@/lib/engine/strategy";
import { generateCreatives } from "@/lib/engine/creative";
import { generateLandingPage } from "@/lib/engine/landing";
import type { PublishRequest } from "@/lib/engine/channels/adapter";

/** A fake fetch that records calls and returns sequential Graph API ids. */
function fakeGraph() {
  const calls: Array<{ url: string; body: string }> = [];
  let n = 0;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? "") });
    n += 1;
    return new Response(JSON.stringify({ id: `obj_${n}` }), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const META_REQ = (): PublishRequest => {
  const brief = ingestBrief({
    company: "Brewly", product: "Brewly Cold Brew Kit",
    description: "Barista-grade cold brew at home in 5 minutes.",
    model: "ecommerce", goal: "sales", currency: "PLN", monthlyBudget: 6000,
    averageOrderValue: 120, grossMargin: 0.6,
  });
  const analysis = analyzeBrief(brief);
  const strategy = buildStrategy(brief, analysis);
  const creatives = generateCreatives(brief, analysis, strategy).filter((c) => c.channel === "meta_ads").slice(0, 2);
  const lp = generateLandingPage(brief, analysis, "A");
  return {
    briefId: brief.id, channel: "meta_ads",
    allocation: { channel: "meta_ads", dailyBudget: 12, share: 0.3 },
    creatives: creatives.length ? creatives : [{ ...generateCreatives(brief, analysis, strategy)[0], channel: "meta_ads" }],
    landingPage: lp, status: "LIVE",
  };
};

describe("Meta client mapping helpers", () => {
  it("maps objective and CTA enums", () => {
    expect(metaObjective("sales")).toBe("OUTCOME_SALES");
    expect(metaObjective("leads")).toBe("OUTCOME_LEADS");
    expect(metaCtaType("Shop now")).toBe("SHOP_NOW");
    expect(metaCtaType("Get a quote")).toBe("GET_QUOTE");
    expect(metaCtaType("Learn more")).toBe("LEARN_MORE");
  });
});

describe("MetaMarketingClient", () => {
  it("creates a campaign as PAUSED and sends the token + objective", async () => {
    const { calls, fetchImpl } = fakeGraph();
    const client = new MetaMarketingClient({ accessToken: "TKN", adAccountId: "act_123", pageId: "999", fetchImpl });
    const res = await client.createCampaign("My Campaign", "OUTCOME_SALES");
    expect(res.id).toBe("obj_1");
    expect(calls[0].url).toContain("/act_123/campaigns");
    expect(calls[0].body).toContain("status=PAUSED");
    expect(calls[0].body).toContain("objective=OUTCOME_SALES");
    expect(calls[0].body).toContain("access_token=TKN");
  });

  it("sends budget in minor units (cents)", async () => {
    const { calls, fetchImpl } = fakeGraph();
    const client = new MetaMarketingClient({ accessToken: "T", adAccountId: "123", pageId: "9", fetchImpl });
    await client.createAdSet({ name: "AS", campaignId: "c1", dailyBudget: 12.5, optimizationGoal: "OFFSITE_CONVERSIONS", countries: ["PL"] });
    expect(decodeURIComponent(calls[0].body)).toContain("daily_budget=1250");
    expect(decodeURIComponent(calls[0].body)).toContain('"countries":["PL"]');
  });

  it("throws MetaApiError with the response body on non-2xx", async () => {
    const fetchImpl = (async () => new Response("bad token", { status: 401 })) as unknown as typeof fetch;
    const client = new MetaMarketingClient({ accessToken: "x", adAccountId: "1", pageId: "9", fetchImpl });
    await expect(client.createCampaign("c", "OUTCOME_SALES")).rejects.toThrowError(/Meta API 401/);
  });
});

describe("MetaAdsAdapter publish gating", () => {
  it("dry-runs when not approved, even with full credentials", async () => {
    const { calls, fetchImpl } = fakeGraph();
    const adapter = new MetaAdsAdapter();
    const res = await adapter.publish(META_REQ(), {
      credential: "TKN", accountId: "act_1", pageId: "9", humanApproved: false, baseUrl: "https://lp.test", fetchImpl,
    });
    expect(res.dryRun).toBe(true);
    expect(res.status).not.toBe("LIVE");
    expect(calls.length).toBe(0); // no API calls in dry-run
  });

  it("dry-runs when approved but credentials are missing", async () => {
    const adapter = new MetaAdsAdapter();
    const res = await adapter.publish(META_REQ(), { humanApproved: true, baseUrl: "https://lp.test" });
    expect(res.dryRun).toBe(true);
  });

  it("creates real PAUSED objects when approved + fully configured", async () => {
    const { calls, fetchImpl } = fakeGraph();
    const adapter = new MetaAdsAdapter();
    const req = META_REQ();
    const res = await adapter.publish(req, {
      credential: "TKN", accountId: "act_1", pageId: "9", countries: ["PL"], humanApproved: true, baseUrl: "https://lp.test", fetchImpl,
    });
    expect(res.dryRun).toBe(false);
    expect(res.status).toBe("PAUSED"); // never auto-activates
    expect(res.externalId).toBe("obj_1"); // the campaign id
    // campaign + adset + (creative+ad) per variant
    const expected = 2 + req.creatives.length * 2;
    expect(calls.length).toBe(expected);
    expect(calls[0].url).toContain("/campaigns");
    expect(calls[1].url).toContain("/adsets");
  });

  it("never exceeds the budget ceiling and downgrades LIVE to dry-run without approval", async () => {
    const brief = ingestBrief({
      company: "Brewly", product: "Kit", description: "x", model: "ecommerce", goal: "sales",
      currency: "PLN", monthlyBudget: 6000, averageOrderValue: 120, grossMargin: 0.6,
    });
    const analysis = analyzeBrief(brief);
    const strategy = buildStrategy(brief, analysis);
    const creatives = generateCreatives(brief, analysis, strategy);
    const lps = [generateLandingPage(brief, analysis, "A"), generateLandingPage(brief, analysis, "B")];
    const out = await publishCampaigns(brief, strategy, creatives, lps, {
      baseUrl: "https://lp.test", humanApproved: false, maxDailyBudget: 50, desiredStatus: "LIVE",
    });
    expect(out.anyLive).toBe(false);
    for (const r of out.results) expect(r.status).not.toBe("LIVE");
  });
});
