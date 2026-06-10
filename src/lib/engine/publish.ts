/**
 * Publish module — turns a strategy + creatives + landing pages into campaign
 * publish requests, routed through channel adapters.
 *
 * Enforces the budget safety ceiling and human-approval gate before anything
 * could go LIVE. In any environment without credentials + approval, every
 * campaign comes back as a dry-run DRAFT.
 */
import { getAdapter } from "./channels/registry";
import type { AdapterContext, PublishResult } from "./channels/adapter";
import type { Brief, CreativeVariant, LandingPage, Strategy } from "./types";

export interface ChannelAccount {
  accountId?: string;
  pageId?: string;
  countries?: string[];
  apiVersion?: string;
}

export interface PublishOptions {
  baseUrl: string;
  /** Per-channel credentials (access tokens) keyed by channel id. */
  credentials?: Partial<Record<string, string>>;
  /** Per-channel account config (ad account id, page id, …) keyed by channel id. */
  accounts?: Partial<Record<string, ChannelAccount>>;
  humanApproved: boolean;
  /** Hard ceiling per channel/day — never exceeded autonomously. */
  maxDailyBudget: number;
  /** Desired status; downgraded to DRAFT when not allowed to go live. */
  desiredStatus?: "DRAFT" | "PAUSED" | "LIVE";
  /** Injectable fetch for the adapters (tests / custom transport). */
  fetchImpl?: typeof fetch;
}

export interface PublishPlanResult {
  results: PublishResult[];
  /** True if any campaign actually went live (real spend possible). */
  anyLive: boolean;
  warnings: string[];
}

export async function publishCampaigns(
  brief: Brief,
  strategy: Strategy,
  creatives: CreativeVariant[],
  landingPages: LandingPage[],
  opts: PublishOptions,
): Promise<PublishPlanResult> {
  const warnings: string[] = [];
  const lpByVariant = pickLandingPages(landingPages);
  const results: PublishResult[] = [];

  for (const alloc of strategy.allocations) {
    // Safety ceiling: clamp budget, warn if the strategy exceeded it.
    let dailyBudget = alloc.dailyBudget;
    if (dailyBudget > opts.maxDailyBudget) {
      warnings.push(`${alloc.channel}: requested ${dailyBudget} > ceiling ${opts.maxDailyBudget} — clamped. Raise REKLAMA_MAX_DAILY_BUDGET (human action) to spend more.`);
      dailyBudget = opts.maxDailyBudget;
    }

    const channelCreatives = creatives.filter((c) => c.channel === alloc.channel);
    if (channelCreatives.length === 0) {
      warnings.push(`${alloc.channel}: no creatives — skipped.`);
      continue;
    }

    const adapter = getAdapter(alloc.channel);
    const account = opts.accounts?.[alloc.channel];
    const ctx: AdapterContext = {
      credential: opts.credentials?.[alloc.channel],
      accountId: account?.accountId,
      pageId: account?.pageId,
      countries: account?.countries,
      apiVersion: account?.apiVersion,
      humanApproved: opts.humanApproved,
      baseUrl: opts.baseUrl,
      fetchImpl: opts.fetchImpl,
    };

    const result = await adapter.publish(
      {
        briefId: brief.id,
        channel: alloc.channel,
        allocation: { ...alloc, dailyBudget },
        creatives: channelCreatives,
        landingPage: lpByVariant,
        status: opts.desiredStatus ?? "DRAFT",
      },
      ctx,
    );
    results.push(result);
    warnings.push(...result.warnings);
  }

  return { results, anyLive: results.some((r) => r.status === "LIVE" && !r.dryRun), warnings };
}

/** Choose the default landing variant (A) for publishing. */
function pickLandingPages(landingPages: LandingPage[]): LandingPage {
  return landingPages.find((lp) => lp.variant === "A") ?? landingPages[0];
}
