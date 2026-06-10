/**
 * Google Ads adapter — real official-API `publishLive` (REST v23).
 *
 * Same safety posture as Meta: activates only when humanApproved AND
 * (access token + developer token + customer id) are present, and creates the
 * campaign PAUSED (budget + campaign only — ad groups/ads are the documented
 * next step). Nothing spends until a human enables it in Google Ads.
 */
import { BaseAdapter } from "./base";
import { type AdapterContext, type PublishRequest, type PublishResult } from "./adapter";
import { GoogleAdsApiError, GoogleAdsClient, googleChannelType } from "./google-client";

function goalFromCtas(req: PublishRequest): Parameters<typeof googleChannelType>[0] {
  const cta = req.creatives[0]?.cta?.toLowerCase() ?? "";
  if (cta.includes("install")) return "app_installs";
  if (cta.includes("learn") && req.creatives.length > 2) return "brand_awareness";
  if (cta.includes("quote") || cta.includes("sign")) return "leads";
  return "sales";
}

export class GoogleAdsAdapter extends BaseAdapter {
  readonly channel = "google_ads" as const;
  protected readonly credentialEnv = "GOOGLE_ADS_DEVELOPER_TOKEN";

  validate(req: PublishRequest): string[] {
    const w = super.validate(req);
    for (const c of req.creatives) {
      if (c.headline.length > 30) w.push(`Google headline > 30 chars: "${c.headline}"`);
    }
    return w;
  }

  /** Live requires an OAuth access token, a developer token, and a customer id. */
  isConfigured(ctx: AdapterContext): boolean {
    return Boolean(ctx.credential && ctx.developerToken && ctx.accountId);
  }

  protected async publishLive(
    req: PublishRequest,
    ctx: AdapterContext,
    destinationUrl: string,
    warnings: string[],
  ): Promise<PublishResult> {
    const client = new GoogleAdsClient({
      accessToken: ctx.credential!,
      developerToken: ctx.developerToken!,
      customerId: ctx.accountId!,
      loginCustomerId: ctx.loginCustomerId,
      apiVersion: ctx.apiVersion,
      fetchImpl: ctx.fetchImpl,
    });

    try {
      const budget = await client.createCampaignBudget(`Reklama budget ${req.briefId}`, req.allocation.dailyBudget);
      const campaign = await client.createCampaign({
        name: `Reklama ${req.briefId} google`,
        budgetResourceName: budget.resourceName,
        channelType: googleChannelType(goalFromCtas(req)),
      });

      warnings.push(`Google Ads: created PAUSED campaign ${campaign.resourceName}. Add ad groups/ads and enable manually to start spend.`);
      return {
        channel: this.channel,
        externalId: campaign.resourceName,
        status: "PAUSED",
        dryRun: false,
        destinationUrl,
        warnings,
      };
    } catch (err) {
      const detail = err instanceof GoogleAdsApiError ? `${err.message} — ${err.body.slice(0, 240)}` : (err as Error).message;
      warnings.push(`Google Ads: live publish failed (${detail}). Nothing was enabled.`);
      return { channel: this.channel, externalId: `failed_${req.briefId}_google`, status: "PAUSED", dryRun: false, destinationUrl, warnings };
    }
  }
}
