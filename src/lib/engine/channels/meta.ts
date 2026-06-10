/**
 * Meta Ads adapter — the first channel with a real official-API `publishLive`.
 *
 * Activates only when (a) a System User access token + ad-account id + page id
 * are present AND (b) a human approved the run. Even then it creates every
 * object PAUSED — standing up a campaign costs nothing; turning it on is a
 * separate, deliberate human action. This satisfies the "first paid launch
 * requires human approval" rule without the engine ever auto-spending.
 */
import { BaseAdapter } from "./base";
import {
  type AdapterContext,
  type PublishRequest,
  type PublishResult,
} from "./adapter";
import {
  MetaApiError,
  MetaMarketingClient,
  metaCtaType,
  metaObjective,
  metaOptimizationGoal,
} from "./meta-client";

/** Infer business goal from the campaign objective hints in the request. */
function goalFromRequest(req: PublishRequest): Parameters<typeof metaObjective>[0] {
  // Optimization goal is carried on the strategy; we map via the first creative's CTA
  // as a fallback, but prefer an explicit objective when present on the allocation.
  const cta = req.creatives[0]?.cta?.toLowerCase() ?? "";
  if (cta.includes("quote") || cta.includes("sign")) return "leads";
  if (cta.includes("install")) return "app_installs";
  if (cta.includes("find")) return "local_visits";
  if (cta.includes("learn")) return "traffic";
  return "sales";
}

export class MetaAdsAdapter extends BaseAdapter {
  readonly channel = "meta_ads" as const;
  protected readonly credentialEnv = "META_ADS_ACCESS_TOKEN";

  validate(req: PublishRequest): string[] {
    const w = super.validate(req);
    for (const c of req.creatives) {
      if (c.primaryText.length > 125) w.push(`Meta primary text long (>125): truncation likely for "${c.id}".`);
    }
    return w;
  }

  /** Live requires token AND ad-account id AND page id. */
  isConfigured(ctx: AdapterContext): boolean {
    return Boolean(ctx.credential && ctx.accountId && ctx.pageId);
  }

  protected async publishLive(
    req: PublishRequest,
    ctx: AdapterContext,
    destinationUrl: string,
    warnings: string[],
  ): Promise<PublishResult> {
    const client = new MetaMarketingClient({
      accessToken: ctx.credential!,
      adAccountId: ctx.accountId!,
      pageId: ctx.pageId!,
      apiVersion: ctx.apiVersion,
      fetchImpl: ctx.fetchImpl,
    });

    const goal = goalFromRequest(req);
    const countries = ctx.countries?.length ? ctx.countries : ["PL"];

    try {
      const campaign = await client.createCampaign(`Reklama ${req.briefId} ${this.channel}`, metaObjective(goal));
      const adset = await client.createAdSet({
        name: `AdSet ${req.briefId}`,
        campaignId: campaign.id,
        dailyBudget: req.allocation.dailyBudget,
        optimizationGoal: metaOptimizationGoal(goal),
        countries,
      });

      // One ad per creative variant, all paused.
      const adIds: string[] = [];
      for (const c of req.creatives) {
        const creative = await client.createAdCreative({
          name: `Creative ${c.id}`,
          headline: c.headline,
          primaryText: c.primaryText,
          link: destinationUrl,
          ctaType: metaCtaType(c.cta),
        });
        const ad = await client.createAd({ name: `Ad ${c.id}`, adsetId: adset.id, creativeId: creative.id });
        adIds.push(ad.id);
      }

      warnings.push(`Meta: created PAUSED campaign ${campaign.id} with ${adIds.length} ad(s). Activate manually in Ads Manager to start spend.`);
      return {
        channel: this.channel,
        externalId: campaign.id,
        status: "PAUSED",
        dryRun: false,
        destinationUrl,
        warnings,
      };
    } catch (err) {
      const detail = err instanceof MetaApiError ? `${err.message} — ${err.body.slice(0, 240)}` : (err as Error).message;
      warnings.push(`Meta: live publish failed (${detail}). Nothing was activated.`);
      return {
        channel: this.channel,
        externalId: `failed_${req.briefId}_meta`,
        status: "PAUSED",
        dryRun: false,
        destinationUrl,
        warnings,
      };
    }
  }
}
