/**
 * Landing-page engine — generates a conversion-ready page spec.
 *
 * Output is a structured `LandingPage` (not raw HTML) so it can be rendered by
 * Next.js, exported to a CMS, or A/B-swapped section by section. Every page
 * ships the conversion essentials the brief mandates: hero, benefits, social
 * proof, FAQ, form, CTA, SEO meta, and wired tracking events.
 */
import type { Analysis, Brief, LandingPage, LandingSection } from "./types";
import { slugify, stableId } from "./util";

const TRACKED_EVENTS = ["page_view", "scroll_50", "scroll_90", "cta_click", "form_submit", "lead", "purchase"];

export function generateLandingPage(brief: Brief, analysis: Analysis, variant: "A" | "B" = "A"): LandingPage {
  const seg = analysis.segments[0];
  const benefitItems = buildBenefits(brief, analysis);

  // Variant B reorders proof above benefits — a real CRO test.
  const proofFirst = variant === "B";

  const hero: LandingSection = {
    kind: "hero",
    heading: variant === "A" ? `${analysis.positioning}` : `${brief.product}: ${headlineBenefit(brief)}`,
    body: `${brief.description} Made for ${seg.name.toLowerCase()}.`,
  };
  const benefits: LandingSection = {
    kind: "benefits",
    heading: "Why it works",
    body: "Concrete outcomes, not features.",
    items: benefitItems,
  };
  const proof: LandingSection = {
    kind: "social_proof",
    heading: "Trusted by people like you",
    body: "Social proof placeholder — wire real testimonials/logos before launch.",
    items: ["“Switched and never looked back.”", "Rated highly by early customers", "Backed by a clear guarantee"],
  };
  const faq: LandingSection = {
    kind: "faq",
    heading: "Frequently asked questions",
    body: "",
    items: buildFaq(brief),
  };
  const form: LandingSection = {
    kind: "form",
    heading: brief.goal === "leads" ? "Get your quote" : "Get started",
    body: "Short form — name, email, and one qualifying question. Includes GDPR consent checkbox.",
    items: ["full_name", "email", brief.goal === "leads" ? "company" : "intent"],
  };
  const cta: LandingSection = {
    kind: "cta",
    heading: ctaHeading(brief),
    body: "Single, unmissable call to action repeated above and below the fold.",
  };

  const sections = proofFirst
    ? [hero, proof, benefits, faq, form, cta]
    : [hero, benefits, proof, faq, form, cta];

  return {
    id: stableId("lp", brief.id, variant),
    briefId: brief.id,
    slug: `${slugify(brief.product)}-${variant.toLowerCase()}`,
    title: `${brief.product} — ${headlineBenefit(brief)}`,
    metaDescription: `${brief.description}`.slice(0, 155),
    sections,
    variant,
    trackedEvents: TRACKED_EVENTS,
  };
}

function buildBenefits(brief: Brief, analysis: Analysis): string[] {
  const base = [
    `${headlineBenefit(brief)} — measurable from day one.`,
    `Built for ${analysis.segments[0].name.toLowerCase()}.`,
    `${analysis.competitorAngles[0] ?? "A clearly better alternative."}`,
  ];
  return base;
}

function buildFaq(brief: Brief): string[] {
  return [
    `What is ${brief.product}? — ${brief.description.slice(0, 120)}`,
    `How fast can I start? — Same day; setup is guided.`,
    brief.goal === "sales" ? `What about returns? — Clear, fair return policy.` : `Is there a free option? — Yes, start without commitment.`,
    `Is my data safe? — Yes; GDPR-compliant, consent-based tracking only.`,
  ];
}

function headlineBenefit(brief: Brief): string {
  switch (brief.goal) {
    case "sales": return "buy in seconds";
    case "leads": return "get qualified fast";
    case "brand_awareness": return "the name worth knowing";
    case "traffic": return "see what's possible";
    case "app_installs": return "install in one tap";
    case "local_visits": return "right around the corner";
  }
}

function ctaHeading(brief: Brief): string {
  switch (brief.goal) {
    case "sales": return "Ready to buy?";
    case "leads": return "Want a quote?";
    default: return "Ready to start?";
  }
}
