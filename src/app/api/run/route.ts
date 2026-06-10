import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { runGrowthLoop } from "@/lib/engine";
import { persistRun } from "@/lib/persistence";

export const dynamic = "force-dynamic";

/**
 * Run the full autonomous growth loop for a brief.
 *
 * Body: a Brief (see briefSchema). Optional `config` for iterations/budget.
 * Publishing is always dry-run from this endpoint — going live requires
 * explicit human approval set via env + a deliberate flag, never an open
 * HTTP request. This is the safety gate from the brief.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Expected a JSON brief body." }, { status: 400 });
    }

    const { config, ...brief } = body as Record<string, unknown>;
    const maxDailyBudget = Number(process.env.REKLAMA_MAX_DAILY_BUDGET ?? 50);

    const result = await runGrowthLoop(brief, {
      iterations: clampIterations((config as any)?.iterations),
      maxDailyBudget,
      // The HTTP surface never authorises live spend.
      humanApproved: false,
      seed: typeof (config as any)?.seed === "string" ? (config as any).seed : "api",
    });

    // Best-effort persistence — never blocks returning the run.
    const persistence = await persistRun(result);

    return NextResponse.json({ ...result, persistence });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "Invalid brief", issues: err.issues }, { status: 422 });
    }
    return NextResponse.json({ error: (err as Error).message ?? "Unknown error" }, { status: 500 });
  }
}

function clampIterations(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 3;
  return Math.max(1, Math.min(10, Math.floor(n)));
}
