/**
 * Budgeted multi-armed bandit allocator (Thompson sampling).
 *
 * Research basis: Xia et al., "Thompson Sampling for Budgeted Multi-armed
 * Bandits" (IJCAI 2015, arXiv:1505.00146) and the multichannel-advertising
 * combinatorial-bandit line (arXiv:2502.02920). Each channel is an arm with an
 * uncertain reward (conversion rate) and a random cost (CPC). On each sampling
 * round we draw a reward and divide by cost, pick the arm with the best
 * reward/cost ratio, and tally wins. Budget share ∝ win frequency, which
 * naturally balances exploitation (proven channels) with exploration (channels
 * we have little data on still get sampled via their wide posterior).
 *
 * The Beta(α,β) reward posterior is sampled via its normal approximation so the
 * implementation stays dependency-free and deterministic under a seeded RNG —
 * see `betaSample`. With no data, every arm starts Beta(1,1) (uniform), so the
 * allocator explores before it exploits. See docs/RESEARCH.md for citations.
 */
import type { ChannelId } from "./types";
import { clamp, round, seededRng } from "./util";

export interface BanditArm {
  channel: ChannelId;
  /** Successes observed so far (conversions). */
  conversions: number;
  /** Trials observed so far (clicks). */
  clicks: number;
  /** Observed average cost per click; falls back to a prior when unknown. */
  cpc: number;
}

export interface BanditAllocation {
  channel: ChannelId;
  /** Share of budget 0..1. */
  share: number;
  dailyBudget: number;
  /** How often this arm won a sampling round, 0..1. */
  winRate: number;
}

export interface BanditOptions {
  totalBudget: number;
  /** Hard per-channel ceiling (safety rail). */
  maxPerChannel: number;
  /** Number of Thompson rounds; more = lower variance. */
  rounds?: number;
  seed?: string;
}

/** Box–Muller standard normal from a seeded uniform RNG. */
function standardNormal(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Sample a conversion rate from the Beta(1+conv, 1+fails) posterior using a
 * normal approximation with a continuity floor on variance so low-data arms
 * keep a wide (exploratory) distribution.
 */
export function betaSample(conversions: number, trials: number, rng: () => number): number {
  const alpha = 1 + conversions;
  const beta = 1 + Math.max(0, trials - conversions);
  const mean = alpha / (alpha + beta);
  const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
  const sample = mean + standardNormal(rng) * Math.sqrt(variance);
  return clamp(sample, 0.0001, 0.9999);
}

/**
 * Allocate budget across channels by budgeted Thompson sampling.
 * Deterministic for a given seed.
 */
export function thompsonAllocate(arms: BanditArm[], opts: BanditOptions): BanditAllocation[] {
  const rounds = opts.rounds ?? 2000;
  const rng = seededRng(opts.seed ?? "bandit");
  const wins = new Map<ChannelId, number>(arms.map((a) => [a.channel, 0]));

  for (let r = 0; r < rounds; r++) {
    let best: ChannelId | null = null;
    let bestValue = -Infinity;
    for (const arm of arms) {
      const sampledCvr = betaSample(arm.conversions, arm.clicks, rng);
      const cost = arm.cpc > 0 ? arm.cpc : 1; // value per currency unit spent
      const value = sampledCvr / cost;
      if (value > bestValue) {
        bestValue = value;
        best = arm.channel;
      }
    }
    if (best) wins.set(best, (wins.get(best) ?? 0) + 1);
  }

  // Raw shares from win frequency.
  const raw = arms.map((a) => ({ channel: a.channel, winRate: (wins.get(a.channel) ?? 0) / rounds }));

  // Apply per-channel ceiling, then renormalise the remainder across the rest.
  const allocations = capAndRenormalise(raw, opts.totalBudget, opts.maxPerChannel);
  return allocations;
}

function capAndRenormalise(
  raw: Array<{ channel: ChannelId; winRate: number }>,
  totalBudget: number,
  maxPerChannel: number,
): BanditAllocation[] {
  const result = raw.map((r) => ({ channel: r.channel, winRate: round(r.winRate, 4), share: r.winRate, dailyBudget: 0 }));

  // Iteratively clamp budgets above the ceiling and redistribute the overflow.
  let budgets = result.map((r) => r.share * totalBudget);
  for (let pass = 0; pass < result.length; pass++) {
    const overflow = budgets.reduce((s, b) => s + Math.max(0, b - maxPerChannel), 0);
    if (overflow <= 0.001) break;
    const headroomIdx = budgets.map((b, i) => (b < maxPerChannel ? i : -1)).filter((i) => i >= 0);
    const headroomTotal = headroomIdx.reduce((s, i) => s + (maxPerChannel - budgets[i]), 0);
    budgets = budgets.map((b, i) => {
      if (b > maxPerChannel) return maxPerChannel;
      if (headroomIdx.includes(i) && headroomTotal > 0) return b + overflow * ((maxPerChannel - b) / headroomTotal);
      return b;
    });
  }

  const spent = budgets.reduce((s, b) => s + b, 0) || 1;
  return result.map((r, i) => ({
    ...r,
    dailyBudget: round(budgets[i]),
    share: round(budgets[i] / spent, 4),
  }));
}
