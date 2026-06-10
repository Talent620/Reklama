/**
 * Seed a demo brief + one persisted run.
 * Safe to run repeatedly (upsert by brief id).
 */
import { PrismaClient } from "@prisma/client";
import { runGrowthLoop, ingestBrief } from "../src/lib/engine/index.js";

const prisma = new PrismaClient();

const DEMO = {
  company: "Brewly",
  product: "Brewly Cold Brew Kit",
  description: "Make barista-grade cold brew at home in 5 minutes. Reusable, zero waste.",
  model: "ecommerce" as const,
  goal: "sales" as const,
  currency: "PLN",
  monthlyBudget: 6000,
  averageOrderValue: 120,
  grossMargin: 0.6,
};

async function main() {
  const brief = ingestBrief(DEMO);
  await prisma.brief.upsert({
    where: { id: brief.id },
    create: {
      id: brief.id,
      company: brief.company,
      product: brief.product,
      description: brief.description,
      model: brief.model,
      goal: brief.goal,
      currency: brief.currency,
      monthlyBudget: brief.monthlyBudget,
      markets: brief.markets ?? ["PL"],
      averageOrderValue: brief.averageOrderValue,
      grossMargin: brief.grossMargin,
    },
    update: {},
  });

  const result = await runGrowthLoop(DEMO, { iterations: 4, seed: "seed" });
  const run = await prisma.run.create({
    data: {
      briefId: brief.id,
      converged: result.converged,
      payload: result as unknown as object,
      campaigns: {
        create: result.publish.results.map((r) => ({
          channel: r.channel,
          externalId: r.externalId,
          status: r.status,
          dryRun: r.dryRun,
          dailyBudget: result.strategy.allocations.find((a) => a.channel === r.channel)?.dailyBudget ?? 0,
          destinationUrl: r.destinationUrl,
        })),
      },
    },
  });

  console.log(`Seeded brief ${brief.id} and run ${run.id} (converged=${result.converged}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
