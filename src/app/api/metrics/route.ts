import { NextResponse } from "next/server";
import { ingestMetrics } from "@/lib/persistence";
import type { MetricSnapshot } from "@/lib/engine";

export const dynamic = "force-dynamic";

/**
 * Ingest real performance metrics reported back from a live platform (or a
 * scheduled pull). Body: { briefId: string, snapshots: MetricSnapshot[] }.
 * Stored against the brief's latest run; subsequent /api/run calls warm-start
 * optimization from this real history.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { briefId?: string; snapshots?: MetricSnapshot[] } | null;
  if (!body?.briefId || !Array.isArray(body.snapshots)) {
    return NextResponse.json({ error: "Expected { briefId, snapshots[] }." }, { status: 400 });
  }
  // Minimal shape validation — reject obviously malformed rows.
  for (const s of body.snapshots) {
    if (typeof s.variantId !== "string" || typeof s.channel !== "string") {
      return NextResponse.json({ error: "Each snapshot needs variantId and channel." }, { status: 422 });
    }
  }
  const result = await ingestMetrics(body.briefId, body.snapshots);
  return NextResponse.json(result, { status: result.persisted ? 200 : 202 });
}
