/**
 * Reklama engine — shared domain types.
 *
 * These types are the contract between every module of the autonomous loop:
 *   brief → analysis → strategy → creative → landing → publish → monitor →
 *   optimize → report → (repeat).
 *
 * They are intentionally framework-agnostic (no React/Next/Prisma imports) so
 * the engine can run in a Node worker, an API route, a test, or a cron job.
 */

// ---------------------------------------------------------------------------
// Brief
// ---------------------------------------------------------------------------

export type BusinessGoal =
  | "sales"
  | "leads"
  | "brand_awareness"
  | "traffic"
  | "app_installs"
  | "local_visits";

export type BusinessModel = "ecommerce" | "saas" | "local_service" | "b2b" | "marketplace" | "content";

export interface Brief {
  /** Stable identifier for the business/project. */
  id: string;
  company: string;
  product: string;
  /** One-paragraph description of the offer / value proposition. */
  description: string;
  model: BusinessModel;
  goal: BusinessGoal;
  /** ISO 4217, e.g. "PLN", "EUR", "USD". */
  currency: string;
  /** Total monthly budget the operator is willing to spend. */
  monthlyBudget: number;
  /** Free-form audience description; analysis refines this into segments. */
  audience?: string;
  /** Two-letter market codes, e.g. ["PL", "DE"]. Defaults to ["PL"]. */
  markets?: string[];
  /** Known competitor names/domains, if any. */
  competitors?: string[];
  /** Average order value / deal size — drives ROAS & CPA targets. */
  averageOrderValue?: number;
  /** Gross margin 0..1 — caps how much we can profitably pay per sale. */
  grossMargin?: number;
  /** Landing destination if the business already has one. */
  websiteUrl?: string;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export interface SeasonalityPoint {
  /** 1..12 */
  month: number;
  /** Demand index, 1.0 == average. */
  index: number;
}

export interface AudienceSegment {
  id: string;
  name: string;
  description: string;
  /** Relative size of the opportunity, 0..1. */
  reach: number;
  /** Expected intent / purchase-readiness, 0..1. */
  intent: number;
  interests: string[];
}

export interface ChannelPotential {
  channel: ChannelId;
  /** 0..100 fit score for this brief. */
  fit: number;
  /** Expected cost-per-acquisition in brief currency. */
  estimatedCpa: number;
  /** Minimum sensible daily spend to gather signal. */
  minDailyBudget: number;
  rationale: string;
}

export interface Analysis {
  briefId: string;
  /** Short positioning statement the rest of the system writes toward. */
  positioning: string;
  segments: AudienceSegment[];
  seasonality: SeasonalityPoint[];
  channelPotential: ChannelPotential[];
  competitorAngles: string[];
  /** Assumptions the engine made where the brief was silent. */
  assumptions: string[];
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

export type ChannelId =
  | "google_ads"
  | "meta_ads"
  | "linkedin_ads"
  | "tiktok_ads"
  | "youtube_ads"
  | "display_remarketing"
  | "email"
  | "seo_organic";

export type CreativeFormat =
  | "search_text"
  | "responsive_display"
  | "social_image"
  | "social_video_storyboard"
  | "carousel"
  | "email"
  | "landing_section";

// ---------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------

export type KpiName = "CTR" | "CPC" | "CPA" | "ROAS" | "CVR" | "CPM" | "LEADS";

export interface Kpi {
  name: KpiName;
  /** Target value. Direction is implied by the KPI (e.g. ROAS↑, CPA↓). */
  target: number;
  /** True when higher is better (ROAS, CTR, CVR). */
  higherIsBetter: boolean;
}

export interface BudgetAllocation {
  channel: ChannelId;
  /** Daily budget in brief currency. */
  dailyBudget: number;
  /** Share of total budget, 0..1. */
  share: number;
}

export interface Experiment {
  id: string;
  hypothesis: string;
  /** Which variants are being compared. */
  variantIds: string[];
  /** Primary KPI used to pick a winner. */
  primaryKpi: KpiName;
  /** Minimum conversions per variant before a decision is allowed. */
  minSampleConversions: number;
}

export interface Strategy {
  briefId: string;
  objective: BusinessGoal;
  kpis: Kpi[];
  allocations: BudgetAllocation[];
  /** Ordered channel rollout — cheapest signal first. */
  rolloutOrder: ChannelId[];
  experiments: Experiment[];
  decisionLog: Decision[];
}

/** A recorded decision with the alternatives that were considered. */
export interface Decision {
  question: string;
  options: string[];
  chosen: string;
  rationale: string;
}

// ---------------------------------------------------------------------------
// Creative
// ---------------------------------------------------------------------------

export interface CreativeVariant {
  id: string;
  channel: ChannelId;
  format: CreativeFormat;
  segmentId: string;
  headline: string;
  primaryText: string;
  cta: string;
  /** Descriptor used to render or brief an image/video. */
  visualBrief: string;
  /** Compliance notes / disclaimers attached to this creative. */
  complianceNotes: string[];
}

// ---------------------------------------------------------------------------
// Landing page
// ---------------------------------------------------------------------------

export interface LandingSection {
  kind: "hero" | "benefits" | "social_proof" | "faq" | "form" | "cta";
  heading: string;
  body: string;
  items?: string[];
}

export interface LandingPage {
  id: string;
  briefId: string;
  slug: string;
  title: string;
  metaDescription: string;
  sections: LandingSection[];
  /** Variant key for A/B testing (e.g. "A", "B"). */
  variant: string;
  /** Tracking events wired into the page. */
  trackedEvents: string[];
}

// ---------------------------------------------------------------------------
// Monitoring & metrics
// ---------------------------------------------------------------------------

export interface MetricSnapshot {
  variantId: string;
  channel: ChannelId;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  revenue: number;
  /** Bounce rate 0..1. */
  bounceRate: number;
  /** Avg seconds on page. */
  timeOnPage: number;
  /** Scroll depth 0..1. */
  scrollDepth: number;
}

export interface DerivedMetrics extends MetricSnapshot {
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
  cvr: number;
  cpm: number;
}

// ---------------------------------------------------------------------------
// Optimization
// ---------------------------------------------------------------------------

export type OptimizationAction =
  | { type: "pause_variant"; variantId: string; reason: string }
  | { type: "scale_budget"; channel: ChannelId; from: number; to: number; reason: string }
  | { type: "cut_budget"; channel: ChannelId; from: number; to: number; reason: string }
  | { type: "promote_winner"; experimentId: string; winnerVariantId: string; reason: string }
  | { type: "request_new_creative"; segmentId: string; channel: ChannelId; reason: string }
  | { type: "flag_anomaly"; variantId: string; metric: string; reason: string }
  | { type: "hold"; reason: string };

export interface OptimizationResult {
  actions: OptimizationAction[];
  /** True when KPIs are met and the loop can stop optimizing. */
  converged: boolean;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export interface Report {
  briefId: string;
  generatedAt: string;
  summary: string;
  kpiStatus: Array<{ kpi: KpiName; target: number; actual: number; met: boolean }>;
  topVariants: Array<{ variantId: string; channel: ChannelId; roas: number; cpa: number }>;
  insights: string[];
  recommendations: string[];
  nextSteps: string[];
}
