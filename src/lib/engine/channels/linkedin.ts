/**
 * LinkedIn Ads adapter — real Marketing API `publishLive` (campaign group).
 *
 * Creates a Campaign Group in DRAFT (the documented first step; campaigns +
 * creatives follow). The created entity id is read from the `x-restli-id`
 * response header (LinkedIn's create convention). Activates only when
 * humanApproved AND (access token + ad account id) are present.
 * Headers: Authorization Bearer, LinkedIn-Version (YYYYMM), X-Restli-Protocol-Version.
 * Docs: https://learn.microsoft.com/en-us/linkedin/marketing/
 */
import { BaseAdapter } from "./base";
import { type AdapterContext, type PublishRequest, type PublishResult } from "./adapter";

export class LinkedInAdsAdapter extends BaseAdapter {
  readonly channel = "linkedin_ads" as const;
  protected readonly credentialEnv = "LINKEDIN_ADS_ACCESS_TOKEN";

  isConfigured(ctx: AdapterContext): boolean {
    return Boolean(ctx.credential && ctx.accountId);
  }

  protected async publishLive(
    req: PublishRequest,
    ctx: AdapterContext,
    destinationUrl: string,
    warnings: string[],
  ): Promise<PublishResult> {
    const fetchImpl = ctx.fetchImpl ?? fetch;
    const version = ctx.apiVersion ?? "202406";
    const accountUrn = ctx.accountId!.startsWith("urn:") ? ctx.accountId! : `urn:li:sponsoredAccount:${ctx.accountId}`;

    try {
      const res = await fetchImpl(`https://api.linkedin.com/rest/adCampaignGroups`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ctx.credential}`,
          "LinkedIn-Version": version,
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
          account: accountUrn,
          name: `Reklama ${req.briefId} linkedin`,
          status: "DRAFT", // never auto-active
        }),
      });
      const id = res.headers.get("x-restli-id") ?? res.headers.get("x-linkedin-id");
      if (!res.ok || !id) {
        throw new Error(`status=${res.status} id=${id ?? "none"} body=${(await res.text()).slice(0, 200)}`);
      }
      warnings.push(`LinkedIn: created DRAFT campaign group ${id}. Add campaigns/creatives and activate manually to spend.`);
      return { channel: this.channel, externalId: id, status: "DRAFT", dryRun: false, destinationUrl, warnings };
    } catch (err) {
      warnings.push(`LinkedIn: live publish failed (${(err as Error).message}). Nothing was enabled.`);
      return { channel: this.channel, externalId: `failed_${req.briefId}_linkedin`, status: "DRAFT", dryRun: false, destinationUrl, warnings };
    }
  }
}
