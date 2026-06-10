import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Analytics event sink for landing pages (page_view, scroll_50/90, cta_click,
 * form_submit, ...). In this build it validates + logs the event; wire it to a
 * warehouse/queue in production. Consent is enforced client-side before send.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { event?: string; variant?: string; ts?: number };
    if (!body?.event) return NextResponse.json({ ok: false }, { status: 400 });
    // Structured log line — pick up by any log drain.
    console.log(JSON.stringify({ kind: "lp_event", event: body.event, variant: body.variant ?? null, ts: body.ts ?? Date.now() }));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
