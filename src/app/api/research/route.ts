import { NextRequest, NextResponse } from "next/server";

const EUREKACLAW_URL = process.env.EUREKACLAW_URL || "http://localhost:8781";

/**
 * POST /api/research — Start a new EurekaClaw research session
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const inputSpec = {
      mode: body.mode || "exploration",
      conjecture: body.conjecture || null,
      query: body.query || "",
      domain: body.domain || "",
      paper_ids: body.paper_ids || [],
      paper_texts: body.paper_texts || [],
      additional_context: body.additional_context || "",
      selected_skills: body.selected_skills || [],
    };

    const response = await fetch(`${EUREKACLAW_URL}/api/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inputSpec),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        { error: `EurekaClaw backend error: ${errText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
      return NextResponse.json(
        {
          error: "EurekaClaw backend is not running. Start it with: cd eurekaclaw && make open",
          code: "BACKEND_OFFLINE",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/research — List all research sessions
 */
export async function GET() {
  try {
    const response = await fetch(`${EUREKACLAW_URL}/api/runs`);
    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to list sessions" },
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
