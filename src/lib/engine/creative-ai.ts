/**
 * AI copy-enhancement step (copywriter role).
 *
 * Optionally rewrites the deterministic template copy using the configured
 * AiProvider. Hard rules:
 *   - Under the rule-based provider it's a NO-OP — returns creatives unchanged,
 *     so tests and offline runs stay reproducible.
 *   - Headline caps are re-enforced after any rewrite (platform policy).
 *   - Any provider/parse error falls back to the original creative — the loop
 *     never fails because the model misbehaved.
 */
import type { AiProvider } from "../ai/provider";
import { ROLE_SYSTEM_PROMPTS } from "../ai/roles";
import type { Brief, CreativeFormat, CreativeVariant } from "./types";

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

export async function enhanceCreativesWithAi(
  creatives: CreativeVariant[],
  brief: Brief,
  provider: AiProvider,
): Promise<CreativeVariant[]> {
  // The deterministic provider adds no value here — keep output reproducible.
  if (provider.name === "rule_based") return creatives;

  const out: CreativeVariant[] = [];
  for (const c of creatives) {
    out.push(await enhanceOne(c, brief, provider));
  }
  return out;
}

async function enhanceOne(c: CreativeVariant, brief: Brief, provider: AiProvider): Promise<CreativeVariant> {
  const cap_ = HEADLINE_CAP[c.format];
  const prompt = [
    `Product: ${brief.product}. ${brief.description}`,
    `Channel: ${c.channel}. Goal: ${brief.goal}.`,
    `Rewrite this ad to be sharper and more concrete.`,
    `Headline MUST be <= ${cap_} characters.`,
    `Return ONLY JSON: {"headline": "...", "primaryText": "...", "cta": "..."}`,
    `Current headline: ${c.headline}`,
    `Current primaryText: ${c.primaryText}`,
    `Current cta: ${c.cta}`,
  ].join("\n");

  try {
    const res = await provider.complete({ task: "copywriter", system: ROLE_SYSTEM_PROMPTS.copywriter, prompt, maxTokens: 400 });
    const json = extractJson(res.text);
    if (!json) return c;
    return {
      ...c,
      headline: typeof json.headline === "string" ? cap(json.headline, cap_) : c.headline,
      primaryText: typeof json.primaryText === "string" ? json.primaryText : c.primaryText,
      cta: typeof json.cta === "string" && json.cta.length <= 25 ? json.cta : c.cta,
    };
  } catch {
    return c; // never fail the loop on a copy rewrite
  }
}

function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}
