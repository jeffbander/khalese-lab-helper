import { NextRequest, NextResponse } from "next/server";

const EUREKACLAW_URL = process.env.EUREKACLAW_URL || "http://localhost:8781";

interface PipelineStage {
  name: string;
  status: string;
  outputs?: {
    directions?: { title?: string; id?: string }[];
    [key: string]: unknown;
  };
}

/**
 * Auto-approve any awaiting gates so the pipeline doesn't stall.
 */
async function autoApproveGates(runId: string, pipeline: PipelineStage[]) {
  const awaiting = pipeline.find((s) => s.status === "awaiting_gate");
  if (!awaiting) return;

  const name = awaiting.name;
  let gateType = "";
  let body: Record<string, unknown> = {};

  if (name.includes("survey")) {
    gateType = "survey";
    body = { paper_ids: [] };
  } else if (name.includes("direction")) {
    gateType = "direction";
    // Pick the first direction from ideation outputs
    const ideation = pipeline.find((s) => s.name === "ideation");
    const dirs = ideation?.outputs?.directions;
    const dir = dirs?.[0]?.title || dirs?.[0]?.id || "";
    body = { direction: dir };
  } else if (name.includes("theory")) {
    gateType = "theory";
    body = { approved: true };
  }

  if (gateType) {
    try {
      await fetch(`${EUREKACLAW_URL}/api/runs/${runId}/gate/${gateType}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      // Gate submission failed — will retry on next poll
    }
  }
}

/**
 * GET /api/research/status?run_id=<id> — Poll research session status
 */
export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get("run_id");

  if (!runId) {
    return NextResponse.json({ error: "run_id is required" }, { status: 400 });
  }

  try {
    let run: Record<string, unknown> | null = null;

    // Try direct run endpoint first
    const response = await fetch(`${EUREKACLAW_URL}/api/runs/${runId}`);
    if (response.ok) {
      const data = await response.json();
      if (!data.error) {
        run = data;
      }
    }

    // Fall back to list endpoint
    if (!run) {
      const listResponse = await fetch(`${EUREKACLAW_URL}/api/runs`);
      if (listResponse.ok) {
        const listData = await listResponse.json();
        const runs = listData.runs || listData;
        run = Array.isArray(runs)
          ? runs.find((r: Record<string, unknown>) => r.run_id === runId) || null
          : null;
      }
    }

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    // Auto-approve any awaiting gates
    const pipeline = (run.pipeline as PipelineStage[]) || [];
    if (pipeline.some((s) => s.status === "awaiting_gate")) {
      autoApproveGates(runId, pipeline);
    }

    return NextResponse.json(run);
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
