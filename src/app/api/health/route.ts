import { NextResponse } from "next/server";
import { resolveProvider } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";

/** Liveness + capability probe used by Docker/CI and the dashboard. */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    aiProvider: resolveProvider().name,
    requireHumanApproval: process.env.REKLAMA_REQUIRE_HUMAN_APPROVAL !== "false",
    maxDailyBudget: Number(process.env.REKLAMA_MAX_DAILY_BUDGET ?? 50),
    time: new Date().toISOString(),
  });
}
