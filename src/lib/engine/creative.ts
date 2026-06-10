/**
 * Creative module — generates ad variants per experiment.
 *
 * Each strategy experiment defines two variant ids (A = outcome-led,
 * B = feature-led). This module fills them with channel-appropriate copy,
 * a CTA, a visual brief, and compliance notes. Copy respects platform limits
 * (e.g. Google Search headline ≤ 30 chars) so output is publish-ready.
 *
 * When an AiProvider with a real model is supplied it can rewrite the copy;
 * the deterministic templates below are the always-available fallback.
 */
import type {
  Analysis,
  Brief,
  ChannelId,
  CreativeFormat,
  CreativeVariant,
  Strategy,
} from "./types";

const CHANNEL_FORMAT: Record<ChannelId, CreativeFormat> = {
  google_ads: "search_text",
  meta_ads: "social_image",
  linkedin_ads: "social_image",
  tiktok_ads: "social_video_storyboard",
  youtube_ads: "social_video_storyboard",
  display_remarketing: "responsive_display",
  email: "email",
  seo_organic: "landing_section",
};

/** Hard character caps per format — keep creatives within platform policy. */
const HEADLINE_CAP: Record<CreativeFormat, number> = {
  search_text: 30,
  responsive_display: 30,
  social_image: 40,
  social_video_storyboard: 60,
  carousel: 40,
  email: 60,
  landing_section: 70,
};

function cap(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + "…";
}

/** Compliance guardrails applied to every creative (truthful-advertising). */
function complianceNotes(brief: Brief): string[] {
  const notes = [
    "No unverifiable superlatives or guaranteed-results claims.",
    "Pricing/promo claims must match the live landing page.",
  ];
  if (brief.model === "ecommerce") notes.push("Show inclusive pricing; disclose shipping where required.");
  if (brief.goal === "leads") notes.push("Form must include a privacy/consent notice (GDPR).");
  return notes;
}

export function generateCreatives(brief: Brief, analysis: Analysis, strategy: Strategy): CreativeVariant[] {
  const notes = complianceNotes(brief);
  const heroSegment = analysis.segments[0];
  const product = brief.product;

  const variants: CreativeVariant[] = [];

  for (const exp of strategy.experiments) {
    const channel = strategy.rolloutOrder.find((ch) =>
      exp.id.includes(ch.replace(/_/g, "")) || true,
    ) as ChannelId;
    // Map each experiment to its channel via id suffix ordering.
    const channelForExp = strategy.rolloutOrder[strategy.experiments.indexOf(exp)] ?? channel;
    const format = CHANNEL_FORMAT[channelForExp];
    const hCap = HEADLINE_CAP[format];

    // Variant A — outcome-led.
    variants.push({
      id: exp.variantIds[0],
      channel: channelForExp,
      format,
      segmentId: heroSegment.id,
      headline: cap(`${outcomeFor(brief)} with ${product}`, hCap),
      primaryText: `${analysis.positioning} Built for ${heroSegment.name.toLowerCase()}. ${ctaSentence(brief)}`,
      cta: ctaFor(brief),
      visualBrief: `Bright, high-contrast hero of ${product} delivering its main outcome; one focal subject, brand colour accent, minimal text overlay.`,
      complianceNotes: notes,
    });

    // Variant B — feature/proof-led.
    variants.push({
      id: exp.variantIds[1],
      channel: channelForExp,
      format,
      segmentId: heroSegment.id,
      headline: cap(`${product}: ${featureFor(brief)}`, hCap),
      primaryText: `Why teams choose ${product}: ${featureFor(brief)}. ${analysis.competitorAngles[0] ?? ""} ${ctaSentence(brief)}`.trim(),
      cta: ctaFor(brief),
      visualBrief: `Product UI / in-use shot with a single proof point called out (number, badge, or before→after); clean background.`,
      complianceNotes: notes,
    });
  }

  return variants;
}

function outcomeFor(brief: Brief): string {
  switch (brief.goal) {
    case "sales": return "Sell more, faster";
    case "leads": return "Get qualified leads";
    case "brand_awareness": return "Get noticed";
    case "traffic": return "Drive ready buyers";
    case "app_installs": return "Get more installs";
    case "local_visits": return "Bring people in";
  }
}

function featureFor(brief: Brief): string {
  return brief.description.split(/[.!?]/)[0]?.trim().slice(0, 60) || "the smarter choice";
}

function ctaFor(brief: Brief): string {
  switch (brief.goal) {
    case "sales": return "Shop now";
    case "leads": return "Get a quote";
    case "app_installs": return "Install free";
    case "local_visits": return "Find us";
    default: return "Learn more";
  }
}

function ctaSentence(brief: Brief): string {
  return `${ctaFor(brief)} →`;
}
