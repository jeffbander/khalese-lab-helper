import { NextRequest, NextResponse } from "next/server";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const ALLOWED_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const EUREKACLAW_URL = process.env.EUREKACLAW_URL || "http://localhost:8781";
const APP_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "https://khalese-lab-helper.vercel.app";

// ── Telegram helpers ──
async function sendMessage(chatId: string, text: string, parseMode = "Markdown") {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: true,
    }),
  });
}

// ── EurekaClaw helpers ──
async function listRuns() {
  const res = await fetch(`${EUREKACLAW_URL}/api/runs`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.runs || data || [];
}

async function getRunFromList(runId: string) {
  const runs = await listRuns();
  if (!runs) return null;
  return runs.find((r: Record<string, unknown>) => r.run_id === runId) || null;
}

async function startRun(query: string, domain: string, context: string) {
  const res = await fetch(`${EUREKACLAW_URL}/api/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "exploration",
      query,
      domain,
      additional_context: context,
      paper_ids: [],
      selected_skills: [],
    }),
  });
  if (!res.ok) return null;
  return res.json();
}

// ── Format helpers ──
function formatDuration(startedAt: string, completedAt?: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const secs = Math.round((end - start) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

interface Pipeline {
  name: string;
  status: string;
  started_at?: string | null;
  completed_at?: string | null;
  error_message?: string;
}

function formatRunStatus(run: Record<string, unknown>): string {
  const statusEmoji: Record<string, string> = {
    completed: "✅", running: "🔄", failed: "❌", queued: "⏳",
    paused: "⏸", pausing: "⏸", resuming: "▶️",
  };
  const emoji = statusEmoji[run.status as string] || "❓";
  const query = ((run.input_spec as Record<string, unknown>)?.query as string) || "Unknown";
  const elapsed = run.started_at ? formatDuration(run.started_at as string, run.completed_at as string | null) : "—";

  let msg = `${emoji} *${query}*\n`;
  msg += `Status: \`${run.status}\` · Elapsed: ${elapsed}\n`;
  msg += `ID: \`${(run.run_id as string).slice(0, 8)}...\`\n`;

  const pipeline = run.pipeline as Pipeline[] | undefined;
  if (pipeline && pipeline.length > 0) {
    const completed = pipeline.filter((s) => s.status === "completed").length;
    msg += `Pipeline: ${completed}/${pipeline.length}\n`;
    for (const stage of pipeline) {
      const icon = stage.status === "completed" ? "✅" :
        stage.status === "in_progress" ? "⏳" :
        stage.status === "failed" ? "❌" : "⬜";
      let dur = "";
      if (stage.started_at && stage.completed_at) {
        dur = ` (${formatDuration(stage.started_at, stage.completed_at)})`;
      } else if (stage.status === "in_progress" && stage.started_at) {
        dur = ` (${formatDuration(stage.started_at)}...)`;
      }
      msg += `  ${icon} ${stage.name}${dur}\n`;
      if (stage.error_message) msg += `    ⚠️ ${stage.error_message}\n`;
    }
  }

  return msg;
}

// ── Command handler ──
async function handleCommand(chatId: string, text: string) {
  const cmd = text.trim().toLowerCase();

  // /start or /help
  if (cmd === "/start" || cmd === "/help") {
    await sendMessage(chatId, `🧬 *Khalese Lab Helper*
_In Runx-1 We Trust_

Commands:
/status — Show all research sessions
/status \`<id>\` — Status of a specific session
/run \`<query>\` — Start new research
/results \`<id>\` — Get LaTeX output
/health — Check backend status
/web — Open the web app

Example:
\`/run RUNX1 mutations in AML\``);
    return;
  }

  // /health
  if (cmd === "/health") {
    try {
      const runs = await listRuns();
      if (runs !== null) {
        await sendMessage(chatId, `✅ *Backend Online*\nEurekaClaw: ${EUREKACLAW_URL}\nRuns: ${runs.length}\nApp: ${APP_URL}`);
      } else {
        await sendMessage(chatId, `❌ *Backend Offline*\nEurekaClaw not responding at ${EUREKACLAW_URL}`);
      }
    } catch {
      await sendMessage(chatId, `❌ *Backend Offline*\nCould not reach EurekaClaw`);
    }
    return;
  }

  // /web
  if (cmd === "/web") {
    await sendMessage(chatId, `🌐 [Open Khalese Lab Helper](${APP_URL})`);
    return;
  }

  // /status [id]
  if (cmd.startsWith("/status")) {
    const idArg = text.trim().slice(7).trim();

    if (idArg) {
      // Specific run
      const run = await getRunFromList(idArg);
      if (!run) {
        // Try prefix match
        const runs = await listRuns();
        const match = runs?.find((r: Record<string, unknown>) => (r.run_id as string).startsWith(idArg));
        if (match) {
          await sendMessage(chatId, formatRunStatus(match));
        } else {
          await sendMessage(chatId, `❌ Run \`${idArg}\` not found`);
        }
      } else {
        await sendMessage(chatId, formatRunStatus(run));
      }
      return;
    }

    // All runs
    const runs = await listRuns();
    if (!runs || runs.length === 0) {
      await sendMessage(chatId, "No research sessions found.");
      return;
    }

    // Sort by created_at descending
    runs.sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
      new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime()
    );

    let msg = `📋 *Recent Sessions* (${runs.length})\n\n`;
    for (const run of runs.slice(0, 5)) {
      const emoji = run.status === "completed" ? "✅" : run.status === "running" ? "🔄" : "❌";
      const query = ((run.input_spec as Record<string, unknown>)?.query as string)?.slice(0, 50) || "—";
      const pipeline = run.pipeline as Pipeline[] | undefined;
      const progress = pipeline ? `${pipeline.filter((s) => s.status === "completed").length}/${pipeline.length}` : "";
      msg += `${emoji} \`${(run.run_id as string).slice(0, 8)}\` ${query}\n`;
      msg += `   ${run.status} ${progress}\n\n`;
    }
    msg += `Use /status \`<id>\` for details`;
    await sendMessage(chatId, msg);
    return;
  }

  // /run <query>
  if (cmd.startsWith("/run ")) {
    const query = text.trim().slice(5).trim();
    if (!query) {
      await sendMessage(chatId, "Usage: `/run <research query>`");
      return;
    }

    await sendMessage(chatId, `🚀 Starting research: _${query}_\nThis may take 15-30 minutes...`);

    try {
      const result = await startRun(query, "biomedical", "Started via Telegram bot");
      if (result && result.run_id) {
        await sendMessage(chatId, `✅ *Session started*\nID: \`${result.run_id.slice(0, 8)}...\`\n\nUse /status \`${result.run_id.slice(0, 8)}\` to track progress\nOr open: ${APP_URL}`);
      } else {
        await sendMessage(chatId, "❌ Failed to start research. Backend may be offline.");
      }
    } catch {
      await sendMessage(chatId, "❌ Failed to reach EurekaClaw backend.");
    }
    return;
  }

  // /results <id>
  if (cmd.startsWith("/results")) {
    const idArg = text.trim().slice(8).trim();
    if (!idArg) {
      await sendMessage(chatId, "Usage: `/results <session_id>`");
      return;
    }

    const runs = await listRuns();
    const run = runs?.find((r: Record<string, unknown>) =>
      (r.run_id as string).startsWith(idArg)
    );

    if (!run) {
      await sendMessage(chatId, `❌ Run \`${idArg}\` not found`);
      return;
    }

    if (run.status !== "completed") {
      await sendMessage(chatId, `⏳ Run is still \`${run.status}\`. Results not ready yet.\n\nUse /status \`${idArg}\` to check progress.`);
      return;
    }

    const latex = (run.output_summary as Record<string, unknown>)?.latex_paper as string;
    if (latex) {
      // Telegram has a 4096 char limit, send in chunks
      const preview = latex.slice(0, 3500);
      await sendMessage(chatId, `📄 *LaTeX Output* (first 3500 chars):\n\n\`\`\`\n${preview}\n\`\`\`\n\n_Full output available in the web app._`, "Markdown");
    } else {
      await sendMessage(chatId, "No LaTeX output found for this run.");
    }
    return;
  }

  // Unknown command
  await sendMessage(chatId, `❓ Unknown command. Send /help for available commands.`);
}

// ── Webhook endpoint ──
export async function POST(req: NextRequest) {
  try {
    const update = await req.json();
    const message = update.message;

    if (!message?.text || !message?.chat?.id) {
      return NextResponse.json({ ok: true });
    }

    const chatId = String(message.chat.id);

    // Only respond to allowed chat ID (if set)
    if (ALLOWED_CHAT_ID && chatId !== ALLOWED_CHAT_ID) {
      await sendMessage(chatId, "⛔ Unauthorized. This bot is private.");
      return NextResponse.json({ ok: true });
    }

    await handleCommand(chatId, message.text);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ ok: true }); // Always return 200 to Telegram
  }
}

// ── GET for health check ──
export async function GET() {
  return NextResponse.json({ status: "ok", bot: "khalese_lab_helper" });
}
