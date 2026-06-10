import { NextResponse } from "next/server";
import { resolveProvider } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";

/**
 * Verifies the AI API is wired and working.
 *
 * - With ANTHROPIC_API_KEY set, it makes a real (tiny) Claude API call and
 *   returns the model's reply — proof the key works.
 * - Without a key, it returns the deterministic rule-based provider so the app
 *   still works offline (just without a real model).
 */
export async function GET() {
  const provider = resolveProvider();
  try {
    const res = await provider.complete({
      task: "healthcheck",
      system: "You are a connectivity test. Reply with exactly: OK",
      prompt: "Reply with the single word: OK",
      maxTokens: 16,
    });
    return NextResponse.json({
      ok: true,
      provider: res.provider,
      model: res.model,
      live: res.provider === "claude",
      sample: res.text.slice(0, 120),
      hint:
        res.provider === "claude"
          ? "Claude API is live — strategy/copy generation uses the model."
          : "No ANTHROPIC_API_KEY set — using the deterministic provider. Paste your key into .env to enable real AI.",
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        provider: provider.name,
        error: (err as Error).message,
        hint: "Check that ANTHROPIC_API_KEY in .env is valid and that outbound network is allowed.",
      },
      { status: 502 },
    );
  }
}
