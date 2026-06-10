/**
 * Shared base adapter. Concrete channels extend this and override the bits
 * that differ (policy validation, credential env var). The default `publish`
 * is dry-run-safe: it only performs a real call when configured AND approved.
 */
import {
  type AdapterContext,
  type ChannelAdapter,
  type PublishRequest,
  type PublishResult,
  buildDestinationUrl,
} from "./adapter";
import type { ChannelId } from "../types";
import { stableId } from "../util";

export abstract class BaseAdapter implements ChannelAdapter {
  abstract readonly channel: ChannelId;
  protected abstract readonly credentialEnv: string;

  isConfigured(ctx: AdapterContext): boolean {
    return Boolean(ctx.credential && ctx.credential.length > 0);
  }

  /** Generic policy checks; subclasses add channel-specific ones. */
  validate(req: PublishRequest): string[] {
    const warnings: string[] = [];
    if (req.creatives.length === 0) warnings.push("No creatives attached.");
    if (req.allocation.dailyBudget <= 0) warnings.push("Daily budget must be positive.");
    for (const c of req.creatives) {
      if (!c.headline.trim()) warnings.push(`Creative ${c.id} has an empty headline.`);
      if (!c.cta.trim()) warnings.push(`Creative ${c.id} has no CTA.`);
    }
    return warnings;
  }

  async publish(req: PublishRequest, ctx: AdapterContext): Promise<PublishResult> {
    const warnings = this.validate(req);
    const destinationUrl = buildDestinationUrl(ctx.baseUrl, this.channel, req.landingPage);
    const configured = this.isConfigured(ctx);

    // Live publishing requires BOTH real credentials and explicit human sign-off.
    const canGoLive = configured && ctx.humanApproved;
    const dryRun = !canGoLive;
    const status = dryRun && req.status === "LIVE" ? "DRAFT" : req.status;

    if (dryRun) {
      if (!configured) warnings.push(`${this.channel}: no credentials (${this.credentialEnv}) — dry-run, nothing published.`);
      else if (!ctx.humanApproved) warnings.push(`${this.channel}: human approval required before going live — created as ${status}.`);
      return {
        channel: this.channel,
        externalId: stableId("dryrun", req.briefId, this.channel, req.landingPage.variant),
        status,
        dryRun: true,
        destinationUrl,
        warnings,
      };
    }

    // Real path. Subclasses implement the official-API call here.
    return this.publishLive(req, ctx, destinationUrl, warnings);
  }

  /**
   * Real publish via the platform's official API. Base implementation refuses
   * to invent an integration — it returns a clear, safe error rather than
   * pretending to have spent money. Concrete adapters override this once a
   * vetted official-API client is wired in.
   */
  protected async publishLive(
    req: PublishRequest,
    _ctx: AdapterContext,
    destinationUrl: string,
    warnings: string[],
  ): Promise<PublishResult> {
    warnings.push(
      `${this.channel}: live publishing not yet wired to the official API in this build — refusing to fake a spend. Returning PAUSED.`,
    );
    return {
      channel: this.channel,
      externalId: stableId("pending", req.briefId, this.channel),
      status: "PAUSED",
      dryRun: false,
      destinationUrl,
      warnings,
    };
  }
}
