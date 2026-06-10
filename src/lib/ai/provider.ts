/**
 * AI provider abstraction.
 *
 * The engine never calls a model directly. It asks an `AiProvider` for a typed
 * completion. Two implementations ship:
 *
 *   - `RuleBasedProvider`  — deterministic, offline, dependency-free. Powers
 *                            tests and any environment without an API key.
 *   - `ClaudeProvider`     — uses the Anthropic Messages API when
 *                            ANTHROPIC_API_KEY is set. Falls back gracefully.
 *
 * Keeping this seam means the autonomous loop is reproducible in CI and never
 * blocks on network/secret availability — a hard requirement from the brief
 * ("plan fallback" + "działać offline").
 */

export interface AiRequest {
  /** High-level task tag, used by the rule-based provider to branch. */
  task: string;
  system: string;
  prompt: string;
  /** Optional structured context the provider may inspect. */
  context?: Record<string, unknown>;
  maxTokens?: number;
}

export interface AiResponse {
  text: string;
  /** Which provider actually answered — surfaced in logs/reports. */
  provider: "claude" | "rule_based";
  model: string;
}

export interface AiProvider {
  readonly name: "claude" | "rule_based";
  complete(req: AiRequest): Promise<AiResponse>;
}

/**
 * Deterministic provider. Given the same input it always returns the same
 * output, which is what makes the pipeline testable. It is not a language
 * model — the engine's modules carry their own heuristics and only use the
 * provider for short, templated text. This keeps Reklama useful with zero
 * external dependencies while leaving a clean upgrade path to Claude.
 */
export class RuleBasedProvider implements AiProvider {
  readonly name = "rule_based" as const;

  async complete(req: AiRequest): Promise<AiResponse> {
    return {
      text: `[rule_based:${req.task}] ${req.prompt.slice(0, 280)}`,
      provider: "rule_based",
      model: "rule-based-v1",
    };
  }
}

/**
 * Claude-backed provider. Uses the Anthropic Messages REST API directly (no
 * SDK dependency) so the build stays lean. If the request fails for any reason
 * it throws; callers are expected to fall back to the rule-based provider.
 */
export class ClaudeProvider implements AiProvider {
  readonly name = "claude" as const;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model = process.env.REKLAMA_AI_MODEL || "claude-sonnet-4-6") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async complete(req: AiRequest): Promise<AiResponse> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: req.maxTokens ?? 1024,
        system: req.system,
        messages: [{ role: "user", content: req.prompt }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Claude API error ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
    const text = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n")
      .trim();

    return { text, provider: "claude", model: this.model };
  }
}

/**
 * Resolve the provider from the environment. Never throws — a missing key
 * simply yields the deterministic provider.
 */
export function resolveProvider(env: NodeJS.ProcessEnv = process.env): AiProvider {
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (key) return new ClaudeProvider(key);
  return new RuleBasedProvider();
}
