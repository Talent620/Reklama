/**
 * Concrete channel adapters + registry.
 *
 * Each adapter encodes the platform's headline/policy constraints. None of
 * them make external calls in this build (publishLive is inherited and
 * refuses to fake spend), so the whole pipeline is safe to run anywhere.
 */
import { BaseAdapter } from "./base";
import { MetaAdsAdapter } from "./meta";
import { GoogleAdsAdapter } from "./google";
import { TikTokAdsAdapter } from "./tiktok";
import { LinkedInAdsAdapter } from "./linkedin";
import type { ChannelAdapter } from "./adapter";
import type { ChannelId } from "../types";

class YouTubeAdsAdapter extends BaseAdapter {
  readonly channel = "youtube_ads" as const;
  protected readonly credentialEnv = "GOOGLE_ADS_DEVELOPER_TOKEN";
}

class DisplayRemarketingAdapter extends BaseAdapter {
  readonly channel = "display_remarketing" as const;
  protected readonly credentialEnv = "GOOGLE_ADS_DEVELOPER_TOKEN";
}

class EmailAdapter extends BaseAdapter {
  readonly channel = "email" as const;
  protected readonly credentialEnv = "EMAIL_API_KEY";
}

class SeoOrganicAdapter extends BaseAdapter {
  readonly channel = "seo_organic" as const;
  protected readonly credentialEnv = "NONE";
  // Organic needs no ad credential; it's always "configured" (publishes content, not spend).
  isConfigured(): boolean {
    return true;
  }
}

const ADAPTERS: ChannelAdapter[] = [
  new GoogleAdsAdapter(),
  new MetaAdsAdapter(),
  new LinkedInAdsAdapter(),
  new TikTokAdsAdapter(),
  new YouTubeAdsAdapter(),
  new DisplayRemarketingAdapter(),
  new EmailAdapter(),
  new SeoOrganicAdapter(),
];

const REGISTRY = new Map<ChannelId, ChannelAdapter>(ADAPTERS.map((a) => [a.channel, a]));

export function getAdapter(channel: ChannelId): ChannelAdapter {
  const a = REGISTRY.get(channel);
  if (!a) throw new Error(`No adapter registered for channel: ${channel}`);
  return a;
}

export function listAdapters(): ChannelAdapter[] {
  return [...REGISTRY.values()];
}
