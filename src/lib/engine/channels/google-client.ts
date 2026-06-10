/**
 * Minimal Google Ads API v23 (REST) client.
 *
 * Implements the two mutates needed to stand up a paused campaign per the
 * contract in `api-specs.ts`:
 *   CampaignBudget:mutate → Campaign:mutate.
 *
 * Safety/design (same posture as the Meta client):
 *   - `fetch` is injected → request construction is unit-testable, no network,
 *     no spend.
 *   - Campaigns are created PAUSED; this client never enables a campaign.
 *   - Money uses Google's `amountMicros` (currency × 1e6) as the API requires.
 *
 * Auth: every REST call carries Authorization: Bearer, developer-token, and
 * login-customer-id headers.
 * Docs: https://developers.google.com/google-ads/api/rest/examples
 */
import type { BusinessGoal } from "../types";

export interface GoogleAdsClientConfig {
  accessToken: string;
  developerToken: string;
  /** Customer id WITHOUT dashes, e.g. "1234567890". */
  customerId: string;
  /** Manager (MCC) customer id for login-customer-id; defaults to customerId. */
  loginCustomerId?: string;
  apiVersion?: string;
  fetchImpl?: typeof fetch;
}

/** Google advertising channel type per business goal. */
export function googleChannelType(goal: BusinessGoal): string {
  switch (goal) {
    case "brand_awareness":
    case "app_installs":
      return "DISPLAY";
    default:
      return "SEARCH";
  }
}

export class GoogleAdsApiError extends Error {
  constructor(message: string, readonly status: number, readonly body: string) {
    super(message);
    this.name = "GoogleAdsApiError";
  }
}

export class GoogleAdsClient {
  private readonly cfg: Required<Omit<GoogleAdsClientConfig, "loginCustomerId" | "apiVersion" | "fetchImpl">> &
    Pick<GoogleAdsClientConfig, "loginCustomerId" | "apiVersion" | "fetchImpl">;
  private readonly version: string;
  private readonly fetchImpl: typeof fetch;

  constructor(cfg: GoogleAdsClientConfig) {
    this.cfg = { ...cfg, customerId: cfg.customerId.replace(/-/g, "") };
    this.version = cfg.apiVersion ?? "v23";
    this.fetchImpl = cfg.fetchImpl ?? fetch;
  }

  private get base(): string {
    return `https://googleads.googleapis.com/${this.version}`;
  }

  private async mutate(resource: string, operations: unknown[]): Promise<{ resourceName: string }> {
    const url = `${this.base}/customers/${this.cfg.customerId}/${resource}:mutate`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.cfg.accessToken}`,
        "developer-token": this.cfg.developerToken,
        "login-customer-id": (this.cfg.loginCustomerId ?? this.cfg.customerId).replace(/-/g, ""),
      },
      body: JSON.stringify({ operations }),
    });
    const text = await res.text();
    if (!res.ok) throw new GoogleAdsApiError(`Google Ads API ${res.status} on ${resource}:mutate`, res.status, text);
    const json = JSON.parse(text) as { results?: Array<{ resourceName?: string }> };
    const resourceName = json.results?.[0]?.resourceName;
    if (!resourceName) throw new GoogleAdsApiError(`Google Ads API returned no resourceName on ${resource}:mutate`, res.status, text);
    return { resourceName };
  }

  createCampaignBudget(name: string, dailyBudget: number): Promise<{ resourceName: string }> {
    return this.mutate("campaignBudgets", [
      {
        create: {
          name,
          // Google expects micros (currency * 1,000,000) as an integer.
          amountMicros: String(Math.max(10000, Math.round(dailyBudget * 1_000_000))),
          deliveryMethod: "STANDARD",
        },
      },
    ]);
  }

  createCampaign(args: { name: string; budgetResourceName: string; channelType: string }): Promise<{ resourceName: string }> {
    return this.mutate("campaigns", [
      {
        create: {
          name: args.name,
          status: "PAUSED",
          advertisingChannelType: args.channelType,
          campaignBudget: args.budgetResourceName,
          // Manual CPC keeps the example self-contained; swap for a smart-bidding
          // strategy resource in production.
          manualCpc: {},
        },
      },
    ]);
  }
}
