/**
 * Demo brief registry.
 *
 * Powers the publicly viewable landing-page routes (`/lp/[slug]`) and the
 * dashboard's example run without needing a database. Each brief deterministically
 * generates the same slugs/pages every time, so links are stable.
 */
import type { BriefInput } from "./brief";
import { ingestBrief } from "./brief";
import { analyzeBrief } from "./analysis";
import { generateLandingPage } from "./landing";
import type { Brief, LandingPage } from "./types";

export const DEMO_BRIEFS: BriefInput[] = [
  {
    company: "Brewly",
    product: "Brewly Cold Brew Kit",
    description: "Make barista-grade cold brew at home in 5 minutes. Reusable, zero waste.",
    model: "ecommerce",
    goal: "sales",
    currency: "PLN",
    monthlyBudget: 6000,
    averageOrderValue: 120,
    grossMargin: 0.6,
  },
  {
    company: "PipelineIQ",
    product: "PipelineIQ",
    description: "AI sales forecasting that tells B2B revenue teams which deals will actually close.",
    model: "b2b",
    goal: "leads",
    currency: "EUR",
    monthlyBudget: 9000,
  },
];

/** All landing pages (variant A & B) for every demo brief, keyed by slug. */
export function demoLandingPages(): Map<string, { page: LandingPage; brief: Brief }> {
  const map = new Map<string, { page: LandingPage; brief: Brief }>();
  for (const input of DEMO_BRIEFS) {
    const brief = ingestBrief(input);
    const analysis = analyzeBrief(brief);
    for (const variant of ["A", "B"] as const) {
      const page = generateLandingPage(brief, analysis, variant);
      map.set(page.slug, { page, brief });
    }
  }
  return map;
}

export function findDemoLanding(slug: string): { page: LandingPage; brief: Brief } | undefined {
  return demoLandingPages().get(slug);
}
