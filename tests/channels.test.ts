import { describe, it, expect } from "vitest";
import { GoogleAdsClient, googleChannelType } from "@/lib/engine/channels/google-client";
import { GoogleAdsAdapter } from "@/lib/engine/channels/google";
import { TikTokAdsAdapter } from "@/lib/engine/channels/tiktok";
import { LinkedInAdsAdapter } from "@/lib/engine/channels/linkedin";
import type { PublishRequest } from "@/lib/engine/channels/adapter";
import { ingestBrief } from "@/lib/engine/brief";
import { analyzeBrief } from "@/lib/engine/analysis";
import { buildStrategy } from "@/lib/engine/strategy";
import { generateCreatives } from "@/lib/engine/creative";
import { generateLandingPage } from "@/lib/engine/landing";

function recorder(handler: (url: string, init?: RequestInit) => Response) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

function reqFor(channel: PublishRequest["channel"]): PublishRequest {
  const brief = ingestBrief({
    company: "Acme", product: "Acme Pro", description: "B2B sales forecasting.",
    model: channel === "linkedin_ads" ? "b2b" : "ecommerce", goal: channel === "linkedin_ads" ? "leads" : "sales",
    currency: "PLN", monthlyBudget: 9000, averageOrderValue: 100, grossMargin: 0.6,
  });
  const analysis = analyzeBrief(brief);
  const strategy = buildStrategy(brief, analysis);
  const creatives = generateCreatives(brief, analysis, strategy).map((c) => ({ ...c, channel }));
  return {
    briefId: brief.id, channel,
    allocation: { channel, dailyBudget: 25, share: 0.3 },
    creatives: creatives.slice(0, 2),
    landingPage: generateLandingPage(brief, analysis, "A"),
    status: "LIVE",
  };
}

describe("Google Ads client", () => {
  it("maps channel type and sends amountMicros + PAUSED + auth headers", async () => {
    const { calls, fetchImpl } = recorder((url) =>
      new Response(JSON.stringify({ results: [{ resourceName: url.includes("campaignBudgets") ? "customers/1/campaignBudgets/9" : "customers/1/campaigns/5" }] }), { status: 200 }),
    );
    const client = new GoogleAdsClient({ accessToken: "AT", developerToken: "DT", customerId: "123-456-7890", fetchImpl });
    const budget = await client.createCampaignBudget("b", 25);
    expect(budget.resourceName).toContain("campaignBudgets");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers["developer-token"]).toBe("DT");
    expect(headers["login-customer-id"]).toBe("1234567890"); // dashes stripped
    expect(String(calls[0].init?.body)).toContain("amountMicros");
    expect(String(calls[0].init?.body)).toContain("25000000"); // 25 * 1e6
    const campaign = await client.createCampaign({ name: "c", budgetResourceName: budget.resourceName, channelType: "SEARCH" });
    expect(campaign.resourceName).toContain("campaigns");
    expect(String(calls[1].init?.body)).toContain('"status":"PAUSED"');
  });

  it("googleChannelType picks DISPLAY for awareness, SEARCH otherwise", () => {
    expect(googleChannelType("brand_awareness")).toBe("DISPLAY");
    expect(googleChannelType("sales")).toBe("SEARCH");
  });
});

describe("Google adapter gating", () => {
  it("dry-runs without a developer token even when approved", async () => {
    const adapter = new GoogleAdsAdapter();
    const res = await adapter.publish(reqFor("google_ads"), { credential: "AT", accountId: "123", humanApproved: true, baseUrl: "https://lp.test" });
    expect(res.dryRun).toBe(true);
  });

  it("creates a PAUSED campaign when fully configured + approved", async () => {
    const { calls, fetchImpl } = recorder((url) =>
      new Response(JSON.stringify({ results: [{ resourceName: url.includes("campaignBudgets") ? "customers/1/campaignBudgets/9" : "customers/1/campaigns/5" }] }), { status: 200 }),
    );
    const adapter = new GoogleAdsAdapter();
    const res = await adapter.publish(reqFor("google_ads"), {
      credential: "AT", developerToken: "DT", accountId: "123", humanApproved: true, baseUrl: "https://lp.test", fetchImpl,
    });
    expect(res.dryRun).toBe(false);
    expect(res.status).toBe("PAUSED");
    expect(calls.length).toBe(2); // budget + campaign
    expect(res.externalId).toContain("campaigns");
  });
});

describe("TikTok adapter", () => {
  it("creates a DISABLE (paused) campaign and treats non-zero code as failure", async () => {
    const ok = recorder(() => new Response(JSON.stringify({ code: 0, data: { campaign_id: "ttc_1" } }), { status: 200 }));
    const adapter = new TikTokAdsAdapter();
    const res = await adapter.publish(reqFor("tiktok_ads"), {
      credential: "AT", advertiserId: "adv1", humanApproved: true, baseUrl: "https://lp.test", fetchImpl: ok.fetchImpl,
    });
    expect(res.status).toBe("PAUSED");
    expect(res.externalId).toBe("ttc_1");
    expect(String(ok.calls[0].init?.body)).toContain("DISABLE");

    const bad = recorder(() => new Response(JSON.stringify({ code: 40001, message: "bad" }), { status: 200 }));
    const res2 = await adapter.publish(reqFor("tiktok_ads"), {
      credential: "AT", advertiserId: "adv1", humanApproved: true, baseUrl: "https://lp.test", fetchImpl: bad.fetchImpl,
    });
    expect(res2.externalId).toContain("failed"); // logical error surfaced, nothing enabled
  });
});

describe("LinkedIn adapter", () => {
  it("creates a DRAFT campaign group and reads x-restli-id", async () => {
    const { fetchImpl } = recorder(() => new Response("{}", { status: 201, headers: { "x-restli-id": "urn:li:sponsoredCampaignGroup:777" } }));
    const adapter = new LinkedInAdsAdapter();
    const res = await adapter.publish(reqFor("linkedin_ads"), {
      credential: "AT", accountId: "5550", humanApproved: true, baseUrl: "https://lp.test", fetchImpl,
    });
    expect(res.dryRun).toBe(false);
    expect(res.status).toBe("DRAFT");
    expect(res.externalId).toContain("777");
  });

  it("dry-runs without credentials", async () => {
    const adapter = new LinkedInAdsAdapter();
    const res = await adapter.publish(reqFor("linkedin_ads"), { humanApproved: true, baseUrl: "https://lp.test" });
    expect(res.dryRun).toBe(true);
  });
});
