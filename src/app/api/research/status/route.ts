import { NextRequest, NextResponse } from "next/server";

const EUREKACLAW_URL = process.env.EUREKACLAW_URL || "http://localhost:8781";

/**
 * GET /api/research/status?run_id=<id> — Poll research session status
 */
export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get("run_id");

  if (!runId) {
    return NextResponse.json({ error: "run_id is required" }, { status: 400 });
  }

  try {
    const response = await fetch(`${EUREKACLAW_URL}/api/runs/${runId}`);
    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to get session status" },
        { status: response.status }
      );
    }
    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "EurekaClaw backend is not running", code: "BACKEND_OFFLINE" },
      { status: 503 }
    );
  }
}

/**
 * POST /api/research/status — Pause or resume a research session
 */
export async function POST(req: NextRequest) {
  try {
    const { run_id, action, feedback } = await req.json();

    if (!run_id || !action) {
      return NextResponse.json(
        { error: "run_id and action are required" },
        { status: 400 }
      );
    }

    let endpoint: string;
    const body: Record<string, string> = {};

    if (action === "pause") {
      endpoint = `${EUREKACLAW_URL}/api/runs/${run_id}/pause`;
    } else if (action === "resume") {
      endpoint = `${EUREKACLAW_URL}/api/runs/${run_id}/resume`;
      if (feedback) body.feedback = feedback;
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "EurekaClaw backend is not running", code: "BACKEND_OFFLINE" },
      { status: 503 }
    );
  }
}
