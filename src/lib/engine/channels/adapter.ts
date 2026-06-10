/**
 * Channel adapter abstraction.
 *
 * Every ad platform is reached through this single interface so the engine
 * never special-cases a vendor. New channels plug in by implementing it
 * (the brief's "abstrakcyjna warstwa adaptera").
 *
 * SAFETY: adapters operate in DRY-RUN unless explicitly given valid
 * credentials AND human approval. In dry-run nothing is sent to any external
 * API — `publish` returns a simulated handle so the rest of the loop can run
 * end-to-end without spending money or touching a live account.
 */
import type { BudgetAllocation, ChannelId, CreativeVariant, LandingPage } from "../types";

export interface PublishRequest {
  briefId: string;
  channel: ChannelId;
  allocation: BudgetAllocation;
  creatives: CreativeVariant[];
  landingPage: LandingPage;
  /** Campaign status to create with. */
  status: "DRAFT" | "PAUSED" | "LIVE";
}

export interface PublishResult {
  channel: ChannelId;
  /** External (or simulated) campaign id. */
  externalId: string;
  status: "DRAFT" | "PAUSED" | "LIVE";
  dryRun: boolean;
  /** UTM-tagged destination the ads point to. */
  destinationUrl: string;
  warnings: string[];
}

export interface AdapterContext {
  /** Resolved credential for this channel, if any. */
  credential?: string;
  /** Whether a human approved going live for this run. */
  humanApproved: boolean;
  /** Base URL where landing pages are hosted. */
  baseUrl: string;
}

export interface ChannelAdapter {
  readonly channel: ChannelId;
  /** True when real credentials are present and usable. */
  isConfigured(ctx: AdapterContext): boolean;
  /** Validate a request against platform policy before publishing. */
  validate(req: PublishRequest): string[];
  publish(req: PublishRequest, ctx: AdapterContext): Promise<PublishResult>;
}

/** Build a UTM-tagged destination URL for a channel/landing pair. */
export function buildDestinationUrl(baseUrl: string, channel: ChannelId, lp: LandingPage): string {
  const url = new URL(`/${lp.slug}`, baseUrl.endsWith("/") ? baseUrl : baseUrl + "/");
  url.searchParams.set("utm_source", channel);
  url.searchParams.set("utm_medium", channel === "email" ? "email" : channel === "seo_organic" ? "organic" : "cpc");
  url.searchParams.set("utm_campaign", lp.briefId);
  url.searchParams.set("utm_content", lp.variant);
  return url.toString();
}
