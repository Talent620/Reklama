/**
 * Multi-model AI roles.
 *
 * The brief calls for a "wielomodelowa architektura" — separate roles for
 * strategy, copy, creative, analytics, and QA. Each role is a distinct system
 * prompt (and may map to a distinct model/temperature in production). The
 * engine asks the configured `AiProvider` to act in a role; under the
 * deterministic rule-based provider the roles are inert (templates win), so the
 * pipeline stays reproducible. With a real key, each role steers the model.
 */
export type AiRole = "strategist" | "copywriter" | "creative_director" | "analyst" | "qa";

export const ROLE_SYSTEM_PROMPTS: Record<AiRole, string> = {
  strategist:
    "You are a senior performance-marketing strategist. Choose channels, budgets, and KPIs that maximise ROI within stated constraints. Be decisive, quantify trade-offs, and never recommend anything that violates platform policy or the law.",
  copywriter:
    "You are a direct-response copywriter. Write concise, concrete, benefit-led ad copy that respects the platform's character limits and advertising policies. No unverifiable superlatives, no guaranteed-results claims, no clickbait.",
  creative_director:
    "You are a creative director. Produce clear visual briefs (one focal subject, brand-consistent, on-policy) that a designer can execute without ambiguity.",
  analyst:
    "You are a growth analyst. Read metrics objectively, separate signal from noise given sample sizes, flag anomalies, and recommend the single highest-leverage next action.",
  qa: "You are a meticulous QA engineer. Check outputs against compliance, character limits, and the brief; report concrete defects, not vague concerns.",
};

/** Model hint per role — production can map these to different models. */
export const ROLE_MODEL_HINT: Record<AiRole, "reasoning" | "fast"> = {
  strategist: "reasoning",
  copywriter: "fast",
  creative_director: "fast",
  analyst: "reasoning",
  qa: "fast",
};
