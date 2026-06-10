/**
 * Concrete official-API integration specs per channel.
 *
 * These are the real, documented endpoints/auth flows each adapter's
 * `publishLive` must use once wired. Captured from official docs (June 2026)
 * so the integration path is unambiguous and an engineer can implement it
 * without guesswork. Citations live in docs/RESEARCH.md.
 *
 * Nothing here makes a network call — it's a documentation/contract layer that
 * adapters and the dashboard can introspect.
 */
import type { ChannelId } from "../types";

export interface ChannelApiSpec {
  channel: ChannelId;
  displayName: string;
  /** Human label for the official API. */
  api: string;
  /** OAuth/token model the adapter must implement. */
  auth: string;
  /** Base URL of the production API. */
  baseUrl: string;
  /** Ordered resource hierarchy to create a running campaign. */
  hierarchy: string[];
  /** The first POST an adapter makes to create a campaign. */
  createCampaign: { method: string; path: string; notes: string };
  docs: string;
  /** Caveats discovered in research that affect implementation. */
  caveats: string[];
}

export const CHANNEL_API_SPECS: Partial<Record<ChannelId, ChannelApiSpec>> = {
  meta_ads: {
    channel: "meta_ads",
    displayName: "Meta Ads",
    api: "Meta Marketing API (Graph API)",
    auth: "System User access token from Business Manager (long-lived, non-expiring when maintained).",
    baseUrl: "https://graph.facebook.com/v23.0",
    hierarchy: ["Ad Account (act_{id})", "Campaign", "Ad Set", "Ad Creative", "Ad"],
    createCampaign: {
      method: "POST",
      path: "/act_{ad_account_id}/campaigns",
      notes: "Set objective (e.g. OUTCOME_SALES/OUTCOME_LEADS) and status=PAUSED first; budget+targeting go on the Ad Set.",
    },
    docs: "https://developers.facebook.com/documentation/ads-commerce/marketing-api",
    caveats: [
      "Use the unified Advantage+ structure for new builds; legacy ASC/AAC deprecated Q1 2026 (MAPI v25).",
      "System User tokens are the gold standard for automation — don't tie tokens to a person.",
    ],
  },
  google_ads: {
    channel: "google_ads",
    displayName: "Google Ads",
    api: "Google Ads API v23 (REST)",
    auth: "OAuth2 access token + developer-token header + login-customer-id header. Service account in a Cloud project for server-to-server.",
    baseUrl: "https://googleads.googleapis.com/v23",
    hierarchy: ["Customer", "Campaign Budget", "Campaign", "Ad Group", "Ad Group Ad"],
    createCampaign: {
      method: "POST",
      path: "/customers/{customer_id}/campaignBudgets:mutate then /campaigns:mutate",
      notes: "Create a shared/standalone CampaignBudget first, then reference it from the Campaign mutate.",
    },
    docs: "https://developers.google.com/google-ads/api/rest/examples",
    caveats: [
      "Developer token needs Basic/Standard (or new Explorer) access level — applications can backlog.",
      "Headers required on every REST call: developer-token, login-customer-id, Authorization.",
    ],
  },
  tiktok_ads: {
    channel: "tiktok_ads",
    displayName: "TikTok Ads",
    api: "TikTok Marketing API",
    auth: "OAuth 2.0 advertiser authorization → access token (refresh daily; refresh token valid 1 year). App must pass TikTok review + data-security check for production.",
    baseUrl: "https://business-api.tiktok.com/open_api/v1.3",
    hierarchy: ["Business Center", "Advertiser", "Campaign", "Ad Group", "Ad"],
    createCampaign: {
      method: "POST",
      path: "/campaign/create/",
      notes: "Pass advertiser_id, objective_type, budget_mode, and status; ad group carries targeting + bid.",
    },
    docs: "https://business-api.tiktok.com/portal",
    caveats: [
      "Sandbox tokens do NOT work against production — switch app credentials and base URL.",
      "Conversion tracking (Events API) uses a separate pixel-tied long-lived token, not user OAuth.",
    ],
  },
  linkedin_ads: {
    channel: "linkedin_ads",
    displayName: "LinkedIn Ads",
    api: "LinkedIn Marketing API",
    auth: "OAuth 2.0 (3-legged) with rw_ads scope; access tokens refreshed via refresh token.",
    baseUrl: "https://api.linkedin.com/rest",
    hierarchy: ["Ad Account", "Campaign Group", "Campaign", "Creative"],
    createCampaign: {
      method: "POST",
      path: "/adCampaignGroups then /adCampaignsV2",
      notes: "Create a Campaign Group, then the Campaign with costType, dailyBudget, and targeting facets.",
    },
    docs: "https://learn.microsoft.com/en-us/linkedin/marketing/",
    caveats: ["Requires LinkedIn Marketing Developer Platform access approval.", "Versioned via LinkedIn-Version header (YYYYMM)."],
  },
};

export function getApiSpec(channel: ChannelId): ChannelApiSpec | undefined {
  return CHANNEL_API_SPECS[channel];
}
