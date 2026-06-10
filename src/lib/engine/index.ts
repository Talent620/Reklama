/** Public engine API. */
export * from "./types";
export { ingestBrief, briefSchema, dailyBudget, targetCpa } from "./brief";
export { analyzeBrief } from "./analysis";
export { buildStrategy } from "./strategy";
export { generateCreatives } from "./creative";
export { generateLandingPage } from "./landing";
export { publishCampaigns } from "./publish";
export { derive, simulatePeriod, mergeSnapshots } from "./monitoring";
export { optimize, isConverged, aggregate } from "./optimization";
export { buildReport } from "./reporting";
export { runGrowthLoop } from "./orchestrator";
export type { RunConfig, RunResult, LoopIteration } from "./orchestrator";
export { getAdapter, listAdapters } from "./channels/registry";
export { thompsonAllocate, betaSample } from "./bandit";
export type { BanditArm, BanditAllocation, BanditOptions } from "./bandit";
export { CHANNEL_API_SPECS, getApiSpec } from "./channels/api-specs";
export type { ChannelApiSpec } from "./channels/api-specs";
