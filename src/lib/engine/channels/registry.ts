/**
 * Concrete channel adapters + registry.
 *
 * Each adapter encodes the platform's headline/policy constraints. None of
 * them make external calls in this build (publishLive is inherited and
 * refuses to fake spend), so the whole pipeline is safe to run anywhere.
 */
import { BaseAdapter } from "./base";
import { MetaAdsAdapter } from "./meta";
import type { ChannelAdapter, PublishRequest } from "./adapter";
import type { ChannelId } from "../types";

class GoogleAdsAdapter extends BaseAdapter {
  readonly channel = "google_ads" as const;
  protected readonly credentialEnv = "GOOGLE_ADS_DEVELOPER_TOKEN";
  validate(req: PublishRequest): string[] {
    const w = super.validate(req);
    for (const c of req.creatives) {
      if (c.headline.length > 30) w.push(`Google headline > 30 chars: "${c.headline}"`);
    }
    return w;
  }
}

class LinkedInAdsAdapter extends BaseAdapter {
  readonly channel = "linkedin_ads" as const;
  protected readonly credentialEnv = "LINKEDIN_ADS_ACCESS_TOKEN";
}

class TikTokAdsAdapter extends BaseAdapter {
  readonly channel = "tiktok_ads" as const;
  protected readonly credentialEnv = "TIKTOK_ADS_ACCESS_TOKEN";
}

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
