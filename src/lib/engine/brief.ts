/**
 * Brief module — ingests and validates business context.
 * The brief is the single source of truth the rest of the loop reads from.
 */
import { z } from "zod";
import type { Brief } from "./types";
import { stableId } from "./util";

export const briefSchema = z.object({
  id: z.string().min(1).optional(),
  company: z.string().min(1, "company is required"),
  product: z.string().min(1, "product is required"),
  description: z.string().min(1, "description is required"),
  model: z.enum(["ecommerce", "saas", "local_service", "b2b", "marketplace", "content"]),
  goal: z.enum(["sales", "leads", "brand_awareness", "traffic", "app_installs", "local_visits"]),
  currency: z.string().length(3).default("PLN"),
  monthlyBudget: z.number().positive("monthlyBudget must be > 0"),
  audience: z.string().optional(),
  markets: z.array(z.string().length(2)).optional(),
  competitors: z.array(z.string()).optional(),
  averageOrderValue: z.number().positive().optional(),
  grossMargin: z.number().min(0).max(1).optional(),
  websiteUrl: z.string().url().optional(),
});

export type BriefInput = z.input<typeof briefSchema>;

/**
 * Normalise raw input into a complete Brief, filling stable defaults.
 * Throws a ZodError with readable messages on invalid input.
 */
export function ingestBrief(input: unknown): Brief {
  const parsed = briefSchema.parse(input);
  const id = parsed.id ?? stableId("brief", parsed.company, parsed.product);
  return {
    id,
    company: parsed.company,
    product: parsed.product,
    description: parsed.description,
    model: parsed.model,
    goal: parsed.goal,
    currency: parsed.currency ?? "PLN",
    monthlyBudget: parsed.monthlyBudget,
    audience: parsed.audience,
    markets: parsed.markets?.length ? parsed.markets : ["PL"],
    competitors: parsed.competitors ?? [],
    averageOrderValue: parsed.averageOrderValue,
    grossMargin: parsed.grossMargin,
    websiteUrl: parsed.websiteUrl,
  };
}

/** Daily budget derived from the monthly figure (30.4 avg days/month). */
export function dailyBudget(brief: Brief): number {
  return brief.monthlyBudget / 30.4;
}

/**
 * Maximum we can profitably pay per acquisition.
 * If margin & AOV are known: target CPA = AOV * margin * payback fraction.
 * Otherwise fall back to a conservative fraction of daily budget.
 */
export function targetCpa(brief: Brief): number {
  if (brief.averageOrderValue && brief.grossMargin) {
    // Spend at most 60% of unit margin to acquire — keeps the loop profitable.
    return brief.averageOrderValue * brief.grossMargin * 0.6;
  }
  return Math.max(5, dailyBudget(brief) * 0.25);
}
