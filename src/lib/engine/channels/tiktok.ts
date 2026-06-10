/**
 * TikTok Ads adapter — real Marketing API `publishLive` (campaign create).
 *
 * Creates the campaign with operation_status DISABLE (paused) so nothing
 * spends; ad groups/ads + activation are the documented next step. Activates
 * only when humanApproved AND (access token + advertiser id) are present.
 * Auth header is `Access-Token`; base is the production open_api host.
 * Docs: https://business-api.tiktok.com/portal
 */
import { BaseAdapter } from "./base";
import { type AdapterContext, type PublishRequest, type PublishResult } from "./adapter";
import type { BusinessGoal } from "../types";

export function tiktokObjective(_req: PublishRequest, cta: string): string {
  const c = cta.toLowerCase();
  if (c.includes("install")) return "APP_PROMOTION";
  if (c.includes("quote") || c.includes("sign")) return "LEAD_GENERATION";
  if (c.includes("learn")) return "TRAFFIC";
  return "WEB_CONVERSIONS";
}

export class TikTokAdsAdapter extends BaseAdapter {
  readonly channel = "tiktok_ads" as const;
  protected readonly credentialEnv = "TIKTOK_ADS_ACCESS_TOKEN";

  isConfigured(ctx: AdapterContext): boolean {
    return Boolean(ctx.credential && (ctx.advertiserId || ctx.accountId));
  }

  protected async publishLive(
    req: PublishRequest,
    ctx: AdapterContext,
    destinationUrl: string,
    warnings: string[],
  ): Promise<PublishResult> {
    const fetchImpl = ctx.fetchImpl ?? fetch;
    const version = ctx.apiVersion ?? "v1.3";
    const advertiserId = ctx.advertiserId ?? ctx.accountId!;
    const objective = tiktokObjective(req, req.creatives[0]?.cta ?? "");

    try {
      const res = await fetchImpl(`https://business-api.tiktok.com/open_api/${version}/campaign/create/`, {
        method: "POST",
        headers: { "content-type": "application/json", "Access-Token": ctx.credential! },
        body: JSON.stringify({
          advertiser_id: advertiserId,
          campaign_name: `Reklama ${req.briefId} tiktok`,
          objective_type: objective,
          budget_mode: "BUDGET_MODE_DAY",
          budget: Math.max(20, Math.round(req.allocation.dailyBudget)),
          operation_status: "DISABLE", // paused — no spend
        }),
      });
      const text = await res.text();
      const json = JSON.parse(text) as { code?: number; message?: string; data?: { campaign_id?: string } };
      // TikTok returns HTTP 200 with a non-zero `code` on logical errors.
      if (!res.ok || (json.code && json.code !== 0) || !json.data?.campaign_id) {
        throw new Error(`code=${json.code} msg=${json.message ?? text.slice(0, 200)}`);
      }
      warnings.push(`TikTok: created paused campaign ${json.data.campaign_id}. Add ad groups/ads and enable manually to spend.`);
      return { channel: this.channel, externalId: json.data.campaign_id, status: "PAUSED", dryRun: false, destinationUrl, warnings };
    } catch (err) {
      warnings.push(`TikTok: live publish failed (${(err as Error).message}). Nothing was enabled.`);
      return { channel: this.channel, externalId: `failed_${req.briefId}_tiktok`, status: "PAUSED", dryRun: false, destinationUrl, warnings };
    }
  }
}

// Re-exported for symmetry/testing.
export type { BusinessGoal };
