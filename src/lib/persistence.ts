/**
 * Run persistence — best-effort, never blocking.
 *
 * Saves a completed growth-loop run (brief, campaigns, final metrics) to
 * Postgres when DATABASE_URL is configured. If no database is set up, or the
 * write fails, it returns a soft result instead of throwing — the engine's
 * value (the run output) is already in hand, persistence is an enhancement.
 */
import type { RunResult } from "./engine";
import { getPrisma, isDatabaseConfigured } from "./db";

export interface PersistResult {
  persisted: boolean;
  runId?: string;
  reason?: string;
}

export async function persistRun(result: RunResult): Promise<PersistResult> {
  if (!isDatabaseConfigured()) {
    return { persisted: false, reason: "DATABASE_URL not configured — run not persisted (engine output still returned)." };
  }

  try {
    const prisma = getPrisma();
    const { brief, strategy, publish } = result;
    const finalMetrics = result.iterations[result.iterations.length - 1]?.metrics ?? [];

    await prisma.brief.upsert({
      where: { id: brief.id },
      update: {},
      create: {
        id: brief.id,
        company: brief.company,
        product: brief.product,
        description: brief.description,
        model: brief.model,
        goal: brief.goal,
        currency: brief.currency,
        monthlyBudget: brief.monthlyBudget,
        markets: brief.markets ?? [],
        averageOrderValue: brief.averageOrderValue ?? null,
        grossMargin: brief.grossMargin ?? null,
        websiteUrl: brief.websiteUrl ?? null,
      },
    });

    const run = await prisma.run.create({
      data: {
        briefId: brief.id,
        converged: result.converged,
        payload: result as unknown as object,
        campaigns: {
          create: publish.results.map((r) => ({
            channel: r.channel,
            externalId: r.externalId,
            status: r.status,
            dryRun: r.dryRun,
            dailyBudget: strategy.allocations.find((a) => a.channel === r.channel)?.dailyBudget ?? 0,
            destinationUrl: r.destinationUrl,
          })),
        },
        metrics: {
          create: finalMetrics.map((m) => ({
            variantId: m.variantId,
            channel: m.channel,
            impressions: m.impressions,
            clicks: m.clicks,
            spend: m.spend,
            conversions: m.conversions,
            revenue: m.revenue,
          })),
        },
      },
    });

    return { persisted: true, runId: run.id };
  } catch (err) {
    return { persisted: false, reason: `Persistence failed: ${(err as Error).message}` };
  }
}
