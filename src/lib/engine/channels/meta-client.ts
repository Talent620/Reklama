/**
 * Minimal Meta Marketing API client (Graph API).
 *
 * Implements exactly the four creates needed to stand up a campaign, following
 * the contract in `api-specs.ts`:
 *   Campaign → Ad Set → Ad Creative → Ad.
 *
 * Design notes / safety:
 *   - `fetch` is injected so the request construction is unit-testable with no
 *     network and no real spend.
 *   - Everything is created with status PAUSED. This client never activates a
 *     campaign — activation is a deliberate, separate human action. Creating
 *     paused objects costs nothing and spends nothing.
 *   - Money fields use Meta's minor units (cents) as the API requires.
 *
 * Docs: https://developers.facebook.com/documentation/ads-commerce/marketing-api
 */
import type { BusinessGoal } from "../types";

export interface MetaClientConfig {
  accessToken: string;
  /** Ad account id WITHOUT the "act_" prefix. */
  adAccountId: string;
  /** Facebook Page id used in ad creatives. */
  pageId: string;
  apiVersion?: string;
  fetchImpl?: typeof fetch;
}

export interface MetaCreativeInput {
  name: string;
  headline: string;
  primaryText: string;
  /** UTM-tagged destination URL. */
  link: string;
  /** Mapped Meta call-to-action enum, e.g. SHOP_NOW. */
  ctaType: string;
}

/** ODAX outcome objective per business goal. */
export function metaObjective(goal: BusinessGoal): string {
  switch (goal) {
    case "sales": return "OUTCOME_SALES";
    case "leads": return "OUTCOME_LEADS";
    case "traffic": return "OUTCOME_TRAFFIC";
    case "brand_awareness": return "OUTCOME_AWARENESS";
    case "app_installs": return "OUTCOME_APP_PROMOTION";
    case "local_visits": return "OUTCOME_AWARENESS";
  }
}

/** Ad-set optimization goal per business goal. */
export function metaOptimizationGoal(goal: BusinessGoal): string {
  switch (goal) {
    case "sales": return "OFFSITE_CONVERSIONS";
    case "leads": return "LEAD_GENERATION";
    case "traffic": return "LINK_CLICKS";
    case "brand_awareness": return "REACH";
    case "app_installs": return "APP_INSTALLS";
    case "local_visits": return "REACH";
  }
}

/** Map our CTA copy to a Meta call_to_action type enum. */
export function metaCtaType(cta: string): string {
  const c = cta.toLowerCase();
  if (c.includes("shop")) return "SHOP_NOW";
  if (c.includes("quote")) return "GET_QUOTE";
  if (c.includes("install")) return "INSTALL_MOBILE_APP";
  if (c.includes("find")) return "GET_DIRECTIONS";
  if (c.includes("sign")) return "SIGN_UP";
  return "LEARN_MORE";
}

export class MetaApiError extends Error {
  constructor(message: string, readonly status: number, readonly body: string) {
    super(message);
    this.name = "MetaApiError";
  }
}

export class MetaMarketingClient {
  private readonly token: string;
  private readonly act: string;
  private readonly pageId: string;
  private readonly version: string;
  private readonly fetchImpl: typeof fetch;

  constructor(cfg: MetaClientConfig) {
    this.token = cfg.accessToken;
    this.act = cfg.adAccountId.replace(/^act_/, "");
    this.pageId = cfg.pageId;
    this.version = cfg.apiVersion ?? "v23.0";
    this.fetchImpl = cfg.fetchImpl ?? fetch;
  }

  private get base(): string {
    return `https://graph.facebook.com/${this.version}`;
  }

  private async post(path: string, params: Record<string, unknown>): Promise<{ id: string }> {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      body.set(k, typeof v === "string" ? v : JSON.stringify(v));
    }
    body.set("access_token", this.token);

    const res = await this.fetchImpl(`${this.base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new MetaApiError(`Meta API ${res.status} on ${path}`, res.status, text);
    }
    const json = JSON.parse(text) as { id?: string };
    if (!json.id) throw new MetaApiError(`Meta API returned no id on ${path}`, res.status, text);
    return { id: json.id };
  }

  createCampaign(name: string, objective: string): Promise<{ id: string }> {
    return this.post(`/act_${this.act}/campaigns`, {
      name,
      objective,
      status: "PAUSED",
      special_ad_categories: [],
    });
  }

  createAdSet(args: {
    name: string;
    campaignId: string;
    dailyBudget: number; // major currency units
    optimizationGoal: string;
    countries: string[];
  }): Promise<{ id: string }> {
    return this.post(`/act_${this.act}/adsets`, {
      name: args.name,
      campaign_id: args.campaignId,
      // Meta expects the budget in minor units (cents) as an integer string.
      daily_budget: Math.max(100, Math.round(args.dailyBudget * 100)),
      billing_event: "IMPRESSIONS",
      optimization_goal: args.optimizationGoal,
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      targeting: { geo_locations: { countries: args.countries } },
      status: "PAUSED",
    });
  }

  createAdCreative(input: MetaCreativeInput): Promise<{ id: string }> {
    return this.post(`/act_${this.act}/adcreatives`, {
      name: input.name,
      object_story_spec: {
        page_id: this.pageId,
        link_data: {
          message: input.primaryText,
          link: input.link,
          name: input.headline,
          call_to_action: { type: input.ctaType, value: { link: input.link } },
        },
      },
    });
  }

  createAd(args: { name: string; adsetId: string; creativeId: string }): Promise<{ id: string }> {
    return this.post(`/act_${this.act}/ads`, {
      name: args.name,
      adset_id: args.adsetId,
      creative: { creative_id: args.creativeId },
      status: "PAUSED",
    });
  }
}
