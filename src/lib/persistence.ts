/**
 * Run persistence — best-effort, never blocking.
 *
 * Saves a completed growth-loop run (brief, campaigns, final metrics) to
 * Postgres when DATABASE_URL is configured. If no database is set up, or the
 * write fails, it returns a soft result instead of throwing — the engine's
 * value (the run output) is already in hand, persistence is an enhancement.
 */
import type { MetricSnapshot, RunResult } from "./engine";
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

/**
 * Load the most recent persisted metrics for a brief, to warm-start a new
 * loop so optimization runs against real history. Empty array when no DB / no
 * data — callers degrade gracefully to simulation.
 */
export async function loadLatestMetrics(briefId: string): Promise<MetricSnapshot[]> {
  if (!isDatabaseConfigured()) return [];
  try {
    const prisma = getPrisma();
    const latestRun = await prisma.run.findFirst({ where: { briefId }, orderBy: { createdAt: "desc" }, include: { metrics: true } });
    if (!latestRun) return [];
    return latestRun.metrics.map((m) => ({
      variantId: m.variantId,
      channel: m.channel as MetricSnapshot["channel"],
      impressions: m.impressions,
      clicks: m.clicks,
      spend: m.spend,
      conversions: m.conversions,
      revenue: m.revenue,
      bounceRate: 0,
      timeOnPage: 0,
      scrollDepth: 0,
    }));
  } catch {
    return [];
  }
}

/**
 * Ingest real metric snapshots reported back from a live platform (or a
 * webhook). Best-effort persistence keyed to the brief's latest run.
 */
export async function ingestMetrics(briefId: string, snapshots: MetricSnapshot[]): Promise<PersistResult> {
  if (!isDatabaseConfigured()) return { persisted: false, reason: "DATABASE_URL not configured — metrics accepted but not stored." };
  try {
    const prisma = getPrisma();
    const run = await prisma.run.findFirst({ where: { briefId }, orderBy: { createdAt: "desc" } });
    if (!run) return { persisted: false, reason: `No run found for brief ${briefId}.` };
    await prisma.metricRow.createMany({
      data: snapshots.map((m) => ({
        runId: run.id,
        variantId: m.variantId,
        channel: m.channel,
        impressions: m.impressions,
        clicks: m.clicks,
        spend: m.spend,
        conversions: m.conversions,
        revenue: m.revenue,
        period: 1,
      })),
    });
    return { persisted: true, runId: run.id };
  } catch (err) {
    return { persisted: false, reason: `Metric ingest failed: ${(err as Error).message}` };
  }
}
