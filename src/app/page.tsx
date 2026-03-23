"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { AppScreen, ResearchConfig, RunStatus, GenerateEvent, PipelineStage } from "@/lib/types";

// ─── KHALESE CHAT MESSAGE TYPE ────────────────────────────
interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
}

// ─── FALLBACK PIPELINE (when EurekaClaw backend is offline) ─
const FALLBACK_STEPS = [
  "Scanning arXiv & PubMed for relevant literature...",
  "Querying Semantic Scholar citation graphs...",
  "Extracting key findings from top 50 papers...",
  "Identifying research gaps and novel angles...",
  "Generating hypotheses via EurekaClaw agent...",
  "Cross-referencing RUNX1 transcription factor databases...",
  "Synthesizing narrative and structuring sections...",
  "Generating LaTeX document with citations...",
  "Running AutoResearch quality checks...",
  "Finalizing camera-ready manuscript...",
];

// ─── RESOURCE TYPES FOR CATAN THEME ────────────────────────
const RESOURCES = [
  { name: "Wood", color: "#6b8c42", icon: "🌲", desc: "Literature" },
  { name: "Brick", color: "#c45c3e", icon: "🧱", desc: "Methods" },
  { name: "Wheat", color: "#e8c845", icon: "🌾", desc: "Data" },
  { name: "Sheep", color: "#8bc34a", icon: "🐑", desc: "Analysis" },
  { name: "Ore", color: "#78909c", icon: "⛰️", desc: "Synthesis" },
];

// ─── ANIMATED HEX TILES FOR BACKGROUND ─────────────────────
function HexBackground() {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
        overflow: "hidden",
      }}
    >
      <div className="hex-pattern" />
      {/* Floating hex accents */}
      {[
        { x: "10%", y: "20%", size: 80, color: "#6b8c42", delay: 0 },
        { x: "85%", y: "15%", size: 60, color: "#c45c3e", delay: 1 },
        { x: "75%", y: "75%", size: 70, color: "#e8c845", delay: 2 },
        { x: "15%", y: "80%", size: 50, color: "#78909c", delay: 0.5 },
        { x: "50%", y: "10%", size: 45, color: "#8bc34a", delay: 1.5 },
        { x: "90%", y: "50%", size: 55, color: "#e8a838", delay: 2.5 },
      ].map((hex, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: hex.x,
            top: hex.y,
            width: hex.size,
            height: hex.size * 1.1547,
            clipPath:
              "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
            background: hex.color,
            opacity: 0.04,
            animation: `float 4s ease-in-out ${hex.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

// ─── HEXAGONAL LOGO ────────────────────────────────────────
function HexLogo({ size = 80 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size * 1.1547,
        clipPath:
          "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
        background: "linear-gradient(135deg, #e8a838, #c45c3e, #6b8c42)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.45,
        fontWeight: 700,
        color: "#1a1410",
        position: "relative",
        boxShadow: "0 0 40px rgba(232, 168, 56, 0.3)",
      }}
    >
      <div
        style={{
          width: size - 6,
          height: (size - 6) * 1.1547,
          clipPath:
            "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
          background: "linear-gradient(135deg, #e8a838 0%, #d4942a 50%, #c45c3e 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "absolute",
        }}
      >
        K
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════
export default function KhaleseLabHelper() {
  // ── State ──
  const [screen, setScreen] = useState<AppScreen>("login");
  const [passcode, setPasscode] = useState("");
  const [loginError, setLoginError] = useState(false);
  const [topic, setTopic] = useState("");

  // Chat state (real AI)
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [apiKeyError, setApiKeyError] = useState(false);

  // Research state
  const [researchConfig, setResearchConfig] = useState<ResearchConfig | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null);
  const [fallbackSteps, setFallbackSteps] = useState<{ label: string; status: string }[]>([]);
  const [fallbackStep, setFallbackStep] = useState(0);
  const [latexOutput, setLatexOutput] = useState("");
  const [researchStartTime, setResearchStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [staleWarning, setStaleWarning] = useState(false);
  const lastStatusChangeRef = useRef<number>(Date.now());
  const lastStatusRef = useRef<string>("");
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  // Elapsed time ticker for research screen
  useEffect(() => {
    if (screen !== "research" || !researchStartTime) return;
    const ticker = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - researchStartTime) / 1000));
    }, 1000);
    return () => clearInterval(ticker);
  }, [screen, researchStartTime]);

  // ── SESSION RECOVERY ──
  // Save session to localStorage when a run starts
  const saveSession = useCallback((rid: string, topicStr: string, startTime: number) => {
    try {
      localStorage.setItem("khalese_session", JSON.stringify({
        runId: rid,
        topic: topicStr,
        startTime,
      }));
    } catch { /* localStorage unavailable */ }
  }, []);

  const clearSession = useCallback(() => {
    try { localStorage.removeItem("khalese_session"); } catch { /* noop */ }
  }, []);

  // On mount: check for an active session to resume
  useEffect(() => {
    try {
      const saved = localStorage.getItem("khalese_session");
      if (!saved) return;
      const session = JSON.parse(saved);
      if (!session.runId) return;

      // Check if this session is still running on the backend
      fetch(`/api/research/status?run_id=${session.runId}`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (!data || data.error) {
            clearSession();
            return;
          }
          // If completed, show results
          if (data.status === "completed") {
            setTopic(session.topic || "");
            setRunId(session.runId);
            setRunStatus(data);
            setBackendOnline(true);
            if (data.output_summary?.latex_paper) {
              setLatexOutput(data.output_summary.latex_paper);
            }
            setScreen("results");
            clearSession();
            return;
          }
          // If failed, clear
          if (data.status === "failed") {
            clearSession();
            return;
          }
          // Still running — resume polling
          setTopic(session.topic || "");
          setRunId(session.runId);
          setRunStatus(data);
          setBackendOnline(true);
          setResearchStartTime(session.startTime || Date.now());
          setScreen("research");
          startPolling(session.runId);
        })
        .catch(() => {
          clearSession();
        });
    } catch { /* localStorage unavailable */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── LOGIN ──
  const handleLogin = () => {
    if (passcode === "071195") {
      setLoginError(false);
      setScreen("topic");
    } else {
      setLoginError(true);
      setTimeout(() => setLoginError(false), 2000);
    }
  };

  // ── START CLARIFICATION WITH KHALESE AI ──
  const startClarification = () => {
    if (!topic.trim()) return;
    setScreen("clarify");
    setMessages([]);
    setApiKeyError(false);

    sendToKhalese([
      {
        id: "init",
        role: "user",
        content: `I want to research: ${topic}`,
      },
    ]);
  };

  // ── SEND MESSAGE TO KHALESE (streaming) ──
  const sendToKhalese = async (msgHistory: ChatMsg[]) => {
    setIsStreaming(true);
    setApiKeyError(false);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: msgHistory.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (err.code === "NO_API_KEY" || response.status === 401) {
          setApiKeyError(true);
          setIsStreaming(false);
          return;
        }
        throw new Error(err.error || "Chat request failed");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const assistantId = `asst-${Date.now()}`;
      let fullContent = "";

      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "" },
      ]);

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullContent += chunk;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: fullContent } : m
          )
        );
      }

      if (fullContent.includes("[RESEARCH_READY]")) {
        const match = fullContent.match(
          /\[RESEARCH_READY\]\s*Topic:\s*(.+?)\s*Domain:\s*(.+?)\s*Mode:\s*(.+?)\s*Query:\s*(.+?)\s*Context:\s*([\s\S]*?)\s*\[\/RESEARCH_READY\]/
        );
        if (match) {
          const config: ResearchConfig = {
            topic: match[1].trim(),
            domain: match[2].trim(),
            mode: match[3].trim() as ResearchConfig["mode"],
            query: match[4].trim(),
            additionalContext: match[5].trim(),
          };
          setResearchConfig(config);
          setTimeout(() => startResearch(config), 2000);
        }
      }
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content:
            "I'm having trouble connecting to my AI backend. Make sure your ANTHROPIC_API_KEY is set in .env.local. In the meantime, I can still help you define your research parameters manually!",
        },
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  // ── HANDLE USER CHAT INPUT ──
  const handleSendMessage = () => {
    if (!inputValue.trim() || isStreaming) return;

    const newMsg: ChatMsg = {
      id: `user-${Date.now()}`,
      role: "user",
      content: inputValue,
    };

    const updatedMessages = [...messages, newMsg];
    setMessages(updatedMessages);
    setInputValue("");
    sendToKhalese(updatedMessages);
  };

  // ── START RESEARCH ──
  const startResearch = async (config: ResearchConfig) => {
    setScreen("research");
    setResearchStartTime(Date.now());
    setElapsedTime(0);
    setStaleWarning(false);
    lastStatusChangeRef.current = Date.now();
    lastStatusRef.current = "";

    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: config.mode,
          query: config.query,
          domain: config.domain,
          additional_context: config.additionalContext,
          paper_ids: config.paperIds || [],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const startTime = Date.now();
        setRunId(data.run_id);
        setBackendOnline(true);
        saveSession(data.run_id, topic, startTime);
        startPolling(data.run_id);
        return;
      }

      const err = await response.json().catch(() => ({}));
      if (err.code === "BACKEND_OFFLINE") {
        setBackendOnline(false);
        runFallbackPipeline(config);
        return;
      }
    } catch {
      setBackendOnline(false);
      runFallbackPipeline(config);
    }
  };

  // ── POLL EUREKACLAW ──
  const startPolling = useCallback((rid: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    let consecutiveErrors = 0;

    pollRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/research/status?run_id=${rid}`);
        if (!response.ok) {
          consecutiveErrors++;
          if (consecutiveErrors >= 10) setStaleWarning(true);
          return;
        }
        consecutiveErrors = 0;

        const data: RunStatus = await response.json();
        setRunStatus(data);

        // Detect stale: build a fingerprint from pipeline statuses + completed count
        const activeStage = data.pipeline
          ?.find((s: PipelineStage) => s.status === "in_progress");
        const completedCount = data.pipeline
          ?.filter((s: PipelineStage) => s.status === "completed").length ?? 0;
        const fingerprint = `${activeStage?.name || data.status}:${completedCount}`;
        if (fingerprint !== lastStatusRef.current) {
          lastStatusRef.current = fingerprint;
          lastStatusChangeRef.current = Date.now();
          setStaleWarning(false);
        } else {
          // Use longer timeout for theory stage (15 min) vs others (5 min)
          const staleTimeout = activeStage?.name === "theory" ? 15 * 60 * 1000 : 5 * 60 * 1000;
          if (Date.now() - lastStatusChangeRef.current > staleTimeout) {
            setStaleWarning(true);
          }
        }

        if (data.status === "completed") {
          if (pollRef.current) clearInterval(pollRef.current);
          if (data.output_summary?.latex_paper) {
            setLatexOutput(data.output_summary.latex_paper);
          }
          clearSession();
          setScreen("results");
        } else if (data.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          clearSession();
        }
      } catch {
        consecutiveErrors++;
        if (consecutiveErrors >= 10) setStaleWarning(true);
      }
    }, 5000);
  }, [clearSession]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── FALLBACK PIPELINE (AI-powered via Claude) ──
  const runFallbackPipeline = async (config: ResearchConfig) => {
    const steps = FALLBACK_STEPS.map((label) => ({ label, status: "pending" }));
    steps[0].status = "running";
    setFallbackSteps(steps);
    setFallbackStep(0);

    try {
      const response = await fetch("/api/research/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!response.ok) throw new Error("Generation failed");

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let latex = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;

          let event: GenerateEvent;
          try {
            event = JSON.parse(line.slice(6));
          } catch {
            continue;
          }

          if (event.type === "step") {
            setFallbackSteps((prev) => {
              const updated = [...prev];
              for (let i = 0; i < event.step && i < updated.length; i++) {
                updated[i].status = "done";
              }
              if (event.step < updated.length) {
                updated[event.step].status = "running";
              }
              return updated;
            });
            setFallbackStep(event.step);
          } else if (event.type === "latex") {
            latex += event.chunk;
          } else if (event.type === "done") {
            // Mark all steps done
            setFallbackSteps((prev) =>
              prev.map((s) => ({ ...s, status: "done" }))
            );
            setFallbackStep(FALLBACK_STEPS.length);
            setLatexOutput(latex);
            setTimeout(() => setScreen("results"), 500);
            return;
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }

      // Stream ended — show results if we have latex
      if (latex) {
        setFallbackSteps((prev) =>
          prev.map((s) => ({ ...s, status: "done" }))
        );
        setLatexOutput(latex);
        setScreen("results");
      } else {
        throw new Error("No content generated");
      }
    } catch (err) {
      console.error("AI generation failed, using static template:", err);
      setLatexOutput(generateFallbackPaper(config));
      setScreen("results");
    }
  };

  // ── FALLBACK PAPER GENERATOR ──
  const generateFallbackPaper = (config: ResearchConfig): string => {
    return `\\documentclass[12pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage[numbers]{natbib}
\\usepackage{geometry}
\\geometry{margin=1in}

\\title{${config.topic}}
\\author{Khalese Lab Helper\\\\
\\small Generated via EurekaClaw + AutoResearch Pipeline\\\\
\\small \\textit{In Runx-1 We Trust}}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
This paper presents a systematic investigation of ${config.topic.toLowerCase()},
focusing on ${config.domain}. Through comprehensive literature mining from PubMed
and arXiv, combined with hypothesis generation via multi-agent AI systems, we
identify novel research directions with high translational potential. Our analysis
reveals previously uncharacterized connections between RUNX1 regulatory networks
and the pathways implicated in ${config.topic.toLowerCase()}.

\\textbf{Note:} This is a template paper generated by Khalese Lab Helper in
offline mode. Connect the EurekaClaw backend for full AI-powered research
synthesis with real literature analysis and citation generation.
\\end{abstract}

\\section{Introduction}
${config.additionalContext || `The role of ${config.topic.toLowerCase()} in modern biomedical research has gained significant attention.`}

RUNX1 (Runt-related transcription factor 1), a master regulator of
hematopoiesis, has been implicated in various disease processes beyond
its canonical roles. This review synthesizes current knowledge and
proposes novel hypotheses for investigation.

\\section{Research Query}
\\textbf{Domain:} ${config.domain}\\\\
\\textbf{Mode:} ${config.mode}\\\\
\\textbf{Query:} ${config.query}

\\section{Methods}
This research utilizes the EurekaClaw multi-agent pipeline:
\\begin{enumerate}
  \\item Literature crawling via arXiv and Semantic Scholar APIs
  \\item Hypothesis generation through cross-paper synthesis
  \\item Theorem proving and formal verification
  \\item LaTeX paper generation with proper citations
\\end{enumerate}

\\section{Next Steps}
To generate a complete, publication-ready paper:
\\begin{enumerate}
  \\item Start the EurekaClaw backend: \\texttt{cd eurekaclaw \\&\\& make open}
  \\item Ensure \\texttt{ANTHROPIC\\_API\\_KEY} is set in \\texttt{.env}
  \\item Re-run this research query through the full pipeline
\\end{enumerate}

\\vspace{1em}
\\noindent\\textit{In Runx-1 We Trust.}

\\bibliographystyle{unsrtnat}
\\bibliography{references}

\\end{document}`;
  };

  // ── MANUAL RESEARCH TRIGGER ──
  const triggerManualResearch = () => {
    const config: ResearchConfig = {
      topic,
      domain: "biomedical",
      mode: "exploration",
      query: topic,
      additionalContext: messages
        .filter((m) => m.role === "user")
        .map((m) => m.content)
        .join("\n"),
    };
    setResearchConfig(config);
    startResearch(config);
  };

  // ── COPY / NEW ──
  const copyLatex = () => navigator.clipboard.writeText(latexOutput);
  const startNewResearch = () => {
    setTopic("");
    setMessages([]);
    setResearchConfig(null);
    setRunId(null);
    setRunStatus(null);
    setLatexOutput("");
    setFallbackSteps([]);
    clearSession();
    setScreen("topic");
  };

  // ═══════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <HexBackground />

      {/* ── HEADER ── */}
      {screen !== "login" && (
        <header
          style={{
            borderBottom: "1px solid var(--border)",
            padding: "16px 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(26, 20, 16, 0.85)",
            backdropFilter: "blur(12px)",
            position: "relative",
            zIndex: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "36px",
                height: "41px",
                clipPath:
                  "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
                background: "linear-gradient(135deg, #e8a838, #c45c3e)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "16px",
                fontWeight: 700,
                color: "#1a1410",
              }}
            >
              K
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: "16px" }}>Khalese Lab Helper</div>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                  fontFamily: "JetBrains Mono, monospace",
                }}
              >
                In Runx-1 We Trust
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {/* Resource badges */}
            <span
              style={{
                fontSize: "11px",
                padding: "4px 10px",
                borderRadius: "12px",
                background: "rgba(232, 168, 56, 0.1)",
                color: "var(--accent)",
                border: "1px solid rgba(232, 168, 56, 0.2)",
                fontFamily: "JetBrains Mono, monospace",
              }}
            >
              EurekaClaw v2.0
            </span>
            <span
              style={{
                fontSize: "11px",
                padding: "4px 10px",
                borderRadius: "12px",
                background: "rgba(107, 140, 66, 0.1)",
                color: "var(--success)",
                border: "1px solid rgba(107, 140, 66, 0.2)",
                fontFamily: "JetBrains Mono, monospace",
              }}
            >
              AutoResearch
            </span>
            {backendOnline !== null && (
              <span
                style={{
                  fontSize: "11px",
                  padding: "4px 10px",
                  borderRadius: "12px",
                  background: backendOnline
                    ? "rgba(107, 140, 66, 0.1)"
                    : "rgba(212, 84, 84, 0.1)",
                  color: backendOnline ? "var(--success)" : "var(--error)",
                  border: `1px solid ${
                    backendOnline
                      ? "rgba(107, 140, 66, 0.2)"
                      : "rgba(212, 84, 84, 0.2)"
                  }`,
                  fontFamily: "JetBrains Mono, monospace",
                }}
              >
                {backendOnline ? "● Backend Online" : "○ Backend Offline"}
              </span>
            )}
          </div>
        </header>
      )}

      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* ════════ LOGIN ════════ */}
        {screen === "login" && (
          <div
            className="screen-transition"
            style={{ textAlign: "center", maxWidth: "480px", width: "100%" }}
          >
            {/* Hex Board decoration */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "4px",
                marginBottom: "8px",
                opacity: 0.6,
              }}
            >
              {RESOURCES.map((r) => (
                <div
                  key={r.name}
                  className="hex-tile hex-tile-sm"
                  style={{ background: r.color, opacity: 0.5 }}
                >
                  <span style={{ fontSize: "14px" }}>{r.icon}</span>
                </div>
              ))}
            </div>

            {/* Logo */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: "24px",
              }}
            >
              <HexLogo size={90} />
            </div>

            <h1
              style={{
                fontSize: "32px",
                fontWeight: 700,
                marginBottom: "8px",
                background: "linear-gradient(135deg, #e8a838, #f5d090)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Khalese Lab Helper
            </h1>

            <p
              style={{
                color: "var(--accent)",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: "14px",
                marginBottom: "8px",
                letterSpacing: "2px",
                textTransform: "uppercase",
              }}
            >
              In Runx-1 We Trust
            </p>

            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: "15px",
                marginBottom: "40px",
                lineHeight: 1.6,
              }}
            >
              AI-powered biomedical research assistant
            </p>

            {/* Road line decoration */}
            <div
              className="road-line"
              style={{ width: "60%", margin: "0 auto 32px" }}
            />

            {/* Login card */}
            <div
              style={{
                padding: "32px",
                borderRadius: "16px",
                background: "rgba(51, 38, 28, 0.8)",
                border: "1px solid var(--border)",
                backdropFilter: "blur(12px)",
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
              }}
            >
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--text-muted)",
                  marginBottom: "16px",
                  fontFamily: "JetBrains Mono, monospace",
                  textTransform: "uppercase",
                  letterSpacing: "2px",
                }}
              >
                Enter Settlement
              </div>

              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                placeholder="Enter lab passcode"
                style={{
                  width: "100%",
                  padding: "16px 20px",
                  borderRadius: "12px",
                  border: loginError
                    ? "2px solid var(--error)"
                    : "1px solid var(--border-light)",
                  background: "rgba(26, 20, 16, 0.6)",
                  color: "var(--text-primary)",
                  fontSize: "18px",
                  outline: "none",
                  textAlign: "center",
                  letterSpacing: "8px",
                  fontFamily: "JetBrains Mono, monospace",
                  marginBottom: "16px",
                  transition: "border-color 0.3s, box-shadow 0.3s",
                }}
                onFocus={(e) => {
                  if (!loginError) {
                    e.target.style.borderColor = "var(--accent)";
                    e.target.style.boxShadow = "0 0 0 3px rgba(232, 168, 56, 0.15)";
                  }
                }}
                onBlur={(e) => {
                  if (!loginError) {
                    e.target.style.borderColor = "var(--border-light)";
                    e.target.style.boxShadow = "none";
                  }
                }}
                autoFocus
              />

              {loginError && (
                <p
                  style={{
                    color: "var(--error)",
                    fontSize: "14px",
                    marginBottom: "16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                  }}
                >
                  <span style={{ fontSize: "16px" }}>7</span>
                  The robber blocks your path. Try again.
                </p>
              )}

              <button
                onClick={handleLogin}
                style={{
                  width: "100%",
                  padding: "16px",
                  borderRadius: "12px",
                  border: "none",
                  background: "linear-gradient(135deg, #e8a838, #c45c3e)",
                  color: "#1a1410",
                  fontSize: "16px",
                  fontWeight: 700,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "2px",
                  transition: "transform 0.2s, box-shadow 0.2s",
                  boxShadow: "0 4px 16px rgba(232, 168, 56, 0.3)",
                }}
                onMouseOver={(e) => {
                  (e.target as HTMLButtonElement).style.transform = "translateY(-2px)";
                  (e.target as HTMLButtonElement).style.boxShadow =
                    "0 6px 24px rgba(232, 168, 56, 0.4)";
                }}
                onMouseOut={(e) => {
                  (e.target as HTMLButtonElement).style.transform = "translateY(0)";
                  (e.target as HTMLButtonElement).style.boxShadow =
                    "0 4px 16px rgba(232, 168, 56, 0.3)";
                }}
              >
                Enter the Settlement
              </button>
            </div>

            {/* Resource bar at bottom */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "12px",
                marginTop: "32px",
                flexWrap: "wrap",
              }}
            >
              {RESOURCES.map((r) => (
                <div
                  key={r.name}
                  className="resource-badge"
                  style={{
                    background: `${r.color}15`,
                    color: r.color,
                    border: `1px solid ${r.color}30`,
                  }}
                >
                  <span>{r.icon}</span>
                  {r.desc}
                </div>
              ))}
            </div>

            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "12px",
                marginTop: "24px",
                fontFamily: "JetBrains Mono, monospace",
              }}
            >
              Powered by EurekaClaw + AutoResearch
            </p>
          </div>
        )}

        {/* ════════ TOPIC INPUT ════════ */}
        {screen === "topic" && (
          <div
            className="screen-transition"
            style={{ maxWidth: "640px", width: "100%", textAlign: "center" }}
          >
            {/* Hex cluster header */}
            <div style={{ display: "flex", justifyContent: "center", gap: "4px", marginBottom: "20px" }}>
              {RESOURCES.slice(0, 3).map((r) => (
                <div
                  key={r.name}
                  className="hex-tile hex-tile-sm float"
                  style={{
                    background: r.color,
                    opacity: 0.7,
                    animationDelay: `${Math.random() * 2}s`,
                  }}
                >
                  <span style={{ fontSize: "16px" }}>{r.icon}</span>
                </div>
              ))}
            </div>

            <h2
              style={{
                fontSize: "26px",
                fontWeight: 600,
                marginBottom: "8px",
                background: "linear-gradient(135deg, #e8a838, #f5d090)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              What would you like to research?
            </h2>
            <p
              style={{
                color: "var(--text-secondary)",
                marginBottom: "32px",
                fontSize: "16px",
                lineHeight: 1.6,
              }}
            >
              Gather your resources and let Khalese guide you
              through the research landscape.
            </p>

            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  startClarification();
                }
              }}
              placeholder="e.g., RUNX1 mutations in acute myeloid leukemia and therapeutic targeting strategies"
              rows={3}
              style={{
                width: "100%",
                padding: "16px 20px",
                borderRadius: "12px",
                border: "1px solid var(--border)",
                background: "var(--bg-card)",
                color: "var(--text-primary)",
                fontSize: "16px",
                outline: "none",
                resize: "vertical",
                fontFamily: "Inter, sans-serif",
                lineHeight: "1.6",
                transition: "border-color 0.3s, box-shadow 0.3s",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "var(--accent)";
                e.target.style.boxShadow = "0 0 0 3px rgba(232, 168, 56, 0.1)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "var(--border)";
                e.target.style.boxShadow = "none";
              }}
              autoFocus
            />

            <button
              onClick={startClarification}
              disabled={!topic.trim()}
              style={{
                marginTop: "16px",
                padding: "14px 48px",
                borderRadius: "12px",
                border: "none",
                background: topic.trim()
                  ? "linear-gradient(135deg, #e8a838, #c45c3e)"
                  : "var(--bg-card)",
                color: topic.trim() ? "#1a1410" : "var(--text-muted)",
                fontSize: "16px",
                fontWeight: 700,
                cursor: topic.trim() ? "pointer" : "not-allowed",
                textTransform: "uppercase",
                letterSpacing: "1px",
                transition: "transform 0.2s, box-shadow 0.2s",
                boxShadow: topic.trim() ? "0 4px 16px rgba(232, 168, 56, 0.3)" : "none",
              }}
            >
              Talk to Khalese
            </button>

            {/* Quick starts as resource tiles */}
            <div style={{ marginTop: "32px" }}>
              <div className="road-line" style={{ width: "40%", margin: "0 auto 20px" }} />
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--text-muted)",
                  marginBottom: "12px",
                  fontFamily: "JetBrains Mono, monospace",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                }}
              >
                Trade Routes
              </p>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                  justifyContent: "center",
                }}
              >
                {[
                  { t: "RUNX1 in hematopoietic stem cells", r: RESOURCES[0] },
                  { t: "CAR-T cell therapy resistance mechanisms", r: RESOURCES[1] },
                  { t: "Single-cell transcriptomics in cardiac regeneration", r: RESOURCES[2] },
                  { t: "Epigenetic regulators in AML", r: RESOURCES[3] },
                ].map(({ t, r }) => (
                  <button
                    key={t}
                    onClick={() => setTopic(t)}
                    style={{
                      padding: "10px 18px",
                      borderRadius: "20px",
                      border: `1px solid ${r.color}40`,
                      background: `${r.color}10`,
                      color: "var(--text-secondary)",
                      fontSize: "13px",
                      cursor: "pointer",
                      transition: "all 0.2s",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                    onMouseOver={(e) => {
                      (e.target as HTMLButtonElement).style.borderColor = `${r.color}80`;
                      (e.target as HTMLButtonElement).style.background = `${r.color}20`;
                    }}
                    onMouseOut={(e) => {
                      (e.target as HTMLButtonElement).style.borderColor = `${r.color}40`;
                      (e.target as HTMLButtonElement).style.background = `${r.color}10`;
                    }}
                  >
                    <span>{r.icon}</span> {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ════════ CLARIFYING QUESTIONS (Real AI Chat) ════════ */}
        {screen === "clarify" && (
          <div
            className="screen-transition"
            style={{
              maxWidth: "720px",
              width: "100%",
              display: "flex",
              flexDirection: "column",
              height: "calc(100vh - 130px)",
            }}
          >
            {apiKeyError && (
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: "8px",
                  background: "rgba(232, 168, 56, 0.1)",
                  border: "1px solid rgba(232, 168, 56, 0.3)",
                  marginBottom: "12px",
                  fontSize: "13px",
                  color: "var(--warning)",
                }}
              >
                <strong>API Key Required:</strong> Add{" "}
                <code
                  style={{
                    background: "rgba(0,0,0,0.3)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                  }}
                >
                  ANTHROPIC_API_KEY=sk-ant-...
                </code>{" "}
                to your <code>.env.local</code> file and restart the dev server.
                Khalese needs Claude to think!
              </div>
            )}

            {/* Chat messages */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "24px 0",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className="slide-up"
                  style={{
                    display: "flex",
                    justifyContent:
                      msg.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "85%",
                      padding: "14px 18px",
                      borderRadius:
                        msg.role === "user"
                          ? "16px 16px 4px 16px"
                          : "16px 16px 16px 4px",
                      background:
                        msg.role === "user"
                          ? "linear-gradient(135deg, #c45c3e, #b8842c)"
                          : "var(--bg-card)",
                      border:
                        msg.role === "assistant"
                          ? "1px solid var(--border)"
                          : "none",
                      fontSize: "15px",
                      lineHeight: "1.6",
                      whiteSpace: "pre-wrap",
                      color: msg.role === "user" ? "#f5efe6" : "var(--text-primary)",
                    }}
                  >
                    {msg.role === "assistant" && (
                      <div
                        style={{
                          fontSize: "11px",
                          color: "var(--accent)",
                          fontWeight: 600,
                          marginBottom: "6px",
                          fontFamily: "JetBrains Mono, monospace",
                          textTransform: "uppercase",
                          letterSpacing: "1px",
                        }}
                      >
                        KHALESE
                      </div>
                    )}
                    {msg.content ||
                      (msg.role === "assistant" ? (
                        <span className="cursor-blink" style={{ color: "var(--text-muted)" }}>
                          Thinking
                        </span>
                      ) : null)}
                  </div>
                </div>
              ))}

              {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <div
                    style={{
                      padding: "14px 18px",
                      borderRadius: "16px 16px 16px 4px",
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      fontSize: "13px",
                      color: "var(--accent)",
                      fontFamily: "JetBrains Mono, monospace",
                    }}
                  >
                    <span className="cursor-blink">Khalese is thinking</span>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input + action buttons */}
            <div
              style={{
                padding: "16px 0",
                borderTop: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  placeholder="Type your answer..."
                  style={{
                    flex: 1,
                    padding: "14px 20px",
                    borderRadius: "12px",
                    border: "1px solid var(--border)",
                    background: "var(--bg-card)",
                    color: "var(--text-primary)",
                    fontSize: "15px",
                    outline: "none",
                    transition: "border-color 0.3s",
                  }}
                  onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
                  autoFocus
                  disabled={isStreaming}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || isStreaming}
                  style={{
                    padding: "14px 24px",
                    borderRadius: "12px",
                    border: "none",
                    background:
                      inputValue.trim() && !isStreaming
                        ? "linear-gradient(135deg, #e8a838, #c45c3e)"
                        : "var(--bg-card)",
                    color:
                      inputValue.trim() && !isStreaming
                        ? "#1a1410"
                        : "var(--text-muted)",
                    fontWeight: 700,
                    cursor:
                      inputValue.trim() && !isStreaming
                        ? "pointer"
                        : "not-allowed",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                    fontSize: "14px",
                  }}
                >
                  Send
                </button>
              </div>

              {messages.length >= 4 && (
                <button
                  onClick={triggerManualResearch}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--text-secondary)",
                    fontSize: "13px",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseOver={(e) => {
                    (e.target as HTMLButtonElement).style.borderColor = "var(--accent)";
                    (e.target as HTMLButtonElement).style.color = "var(--accent)";
                  }}
                  onMouseOut={(e) => {
                    (e.target as HTMLButtonElement).style.borderColor = "var(--border)";
                    (e.target as HTMLButtonElement).style.color = "var(--text-secondary)";
                  }}
                >
                  Skip to research — I have enough context
                </button>
              )}
            </div>
          </div>
        )}

        {/* ════════ RESEARCH PIPELINE ════════ */}
        {screen === "research" && (
          <div
            className="screen-transition"
            style={{ maxWidth: "640px", width: "100%" }}
          >
            <div style={{ textAlign: "center", marginBottom: "32px" }}>
              {/* Spinning hex */}
              <div
                className="pulse-glow"
                style={{
                  width: "64px",
                  height: "74px",
                  clipPath:
                    "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
                  background: "linear-gradient(135deg, #e8a838, #c45c3e)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "28px",
                  marginBottom: "16px",
                }}
              >
                <span style={{ animation: "diceRoll 2s ease-in-out infinite" }}>
                  ⚗️
                </span>
              </div>
              <h2
                style={{
                  fontSize: "22px",
                  fontWeight: 600,
                  marginBottom: "8px",
                  color: "var(--accent)",
                }}
              >
                Gathering Resources
              </h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "15px" }}>
                {backendOnline
                  ? "EurekaClaw is running the full research pipeline..."
                  : `Khalese is analyzing "${topic}"`}
              </p>

              {/* Elapsed timer */}
              <div
                style={{
                  marginTop: "12px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 16px",
                  borderRadius: "20px",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: "13px",
                  color: "var(--text-secondary)",
                }}
              >
                <span style={{ color: "var(--accent)" }}>
                  {String(Math.floor(elapsedTime / 60)).padStart(2, "0")}:
                  {String(elapsedTime % 60).padStart(2, "0")}
                </span>
                elapsed
              </div>

              {/* Stale warning */}
              {staleWarning && (
                <div
                  style={{
                    marginTop: "12px",
                    padding: "10px 16px",
                    borderRadius: "8px",
                    background: "rgba(232, 168, 56, 0.1)",
                    border: "1px solid rgba(232, 168, 56, 0.3)",
                    fontSize: "13px",
                    color: "var(--warning)",
                  }}
                >
                  <strong>Heads up:</strong> No progress in the last 5 minutes.
                  The pipeline may be stuck or the backend may be unresponsive.
                </div>
              )}

              {runStatus?.status === "failed" && (
                <div
                  style={{
                    marginTop: "12px",
                    padding: "10px 16px",
                    borderRadius: "8px",
                    background: "rgba(212, 84, 84, 0.1)",
                    border: "1px solid rgba(212, 84, 84, 0.3)",
                    fontSize: "13px",
                    color: "var(--error)",
                  }}
                >
                  <strong>Failed:</strong> {runStatus.error}
                </div>
              )}
            </div>

            {/* Progress — EurekaClaw pipeline stages */}
            {backendOnline && runStatus ? (
              <div
                style={{
                  padding: "20px",
                  borderRadius: "12px",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                }}
              >
                {/* Header bar */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "16px",
                    paddingBottom: "12px",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "2px" }}>
                      Session
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "JetBrains Mono, monospace" }}>
                      {(runStatus.eureka_session_id || runStatus.run_id).slice(0, 8)}...
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: "11px",
                      padding: "4px 12px",
                      borderRadius: "12px",
                      fontFamily: "JetBrains Mono, monospace",
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                      background:
                        runStatus.status === "running" ? "rgba(232, 168, 56, 0.1)" :
                        runStatus.status === "completed" ? "rgba(107, 140, 66, 0.1)" :
                        runStatus.status === "failed" ? "rgba(212, 84, 84, 0.1)" :
                        "rgba(120, 144, 156, 0.1)",
                      color:
                        runStatus.status === "running" ? "var(--accent)" :
                        runStatus.status === "completed" ? "var(--success)" :
                        runStatus.status === "failed" ? "var(--error)" :
                        "var(--text-muted)",
                      border: `1px solid ${
                        runStatus.status === "running" ? "rgba(232, 168, 56, 0.2)" :
                        runStatus.status === "completed" ? "rgba(107, 140, 66, 0.2)" :
                        runStatus.status === "failed" ? "rgba(212, 84, 84, 0.2)" :
                        "rgba(120, 144, 156, 0.2)"
                      }`,
                    }}
                  >
                    {runStatus.status}
                  </span>
                </div>

                {/* Pipeline progress bar with estimated time */}
                {runStatus.pipeline && runStatus.pipeline.length > 0 && (() => {
                  const ESTIMATED_STAGE_SECONDS: Record<string, number> = {
                    survey: 90,
                    ideation: 120,
                    direction_selection_gate: 30,
                    theory: 300,
                    theory_review_gate: 60,
                    experiment: 120,
                    writer: 180,
                  };
                  const completed = runStatus.pipeline!.filter((s: PipelineStage) => s.status === "completed");
                  const inProgress = runStatus.pipeline!.find((s: PipelineStage) => s.status === "in_progress");
                  const total = runStatus.pipeline!.length;

                  // Calculate weighted progress including partial progress on current stage
                  const totalEstSec = runStatus.pipeline!.reduce((sum: number, s: PipelineStage) =>
                    sum + (ESTIMATED_STAGE_SECONDS[s.name] || 120), 0);
                  let completedSec = completed.reduce((sum: number, s: PipelineStage) => {
                    if (s.started_at && s.completed_at) {
                      return sum + (new Date(s.completed_at).getTime() - new Date(s.started_at).getTime()) / 1000;
                    }
                    return sum + (ESTIMATED_STAGE_SECONDS[s.name] || 120);
                  }, 0);
                  let currentStagePct = 0;
                  if (inProgress?.started_at) {
                    const elapsed = (Date.now() - new Date(inProgress.started_at).getTime()) / 1000;
                    const est = ESTIMATED_STAGE_SECONDS[inProgress.name] || 120;
                    currentStagePct = Math.min(elapsed / est, 0.95);
                    completedSec += elapsed;
                  }
                  const pct = Math.min(((completed.length + currentStagePct) / total) * 100, 99);

                  // Estimated remaining
                  const remainingSec = Math.max(totalEstSec - completedSec, 0);
                  const remainMin = Math.ceil(remainingSec / 60);
                  const etaText = runStatus.status === "completed" ? "Done!" :
                    remainMin <= 1 ? "~1 min remaining" : `~${remainMin} min remaining`;

                  return (
                    <div style={{ marginBottom: "20px" }}>
                      {/* Labels */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>Pipeline</span>
                          <span style={{
                            fontSize: "12px",
                            padding: "2px 8px",
                            borderRadius: "10px",
                            background: "rgba(232, 168, 56, 0.1)",
                            color: "var(--accent)",
                            fontFamily: "JetBrains Mono, monospace",
                          }}>
                            {completed.length}/{total}
                          </span>
                        </div>
                        <span style={{
                          fontSize: "12px",
                          color: "var(--text-muted)",
                          fontFamily: "JetBrains Mono, monospace",
                        }}>
                          {etaText}
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div style={{
                        height: "10px",
                        borderRadius: "5px",
                        background: "rgba(74, 56, 40, 0.5)",
                        overflow: "hidden",
                        position: "relative",
                      }}>
                        <div
                          className="progress-stripe"
                          style={{
                            height: "100%",
                            width: `${pct}%`,
                            background: "linear-gradient(90deg, #6b8c42, #e8c845, #c45c3e, #e8a838)",
                            borderRadius: "5px",
                            transition: "width 1s ease",
                          }}
                        />
                      </div>

                      {/* Percentage */}
                      <div style={{
                        textAlign: "right",
                        marginTop: "4px",
                        fontSize: "11px",
                        fontFamily: "JetBrains Mono, monospace",
                        color: "var(--text-muted)",
                      }}>
                        {Math.round(pct)}%
                      </div>
                    </div>
                  );
                })()}

                {/* Pipeline stages */}
                {runStatus.pipeline && runStatus.pipeline.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {runStatus.pipeline.map((stage: PipelineStage, i: number) => {
                        let duration = "";
                        if (stage.started_at && stage.completed_at) {
                          const s = new Date(stage.started_at).getTime();
                          const e = new Date(stage.completed_at).getTime();
                          const secs = Math.round((e - s) / 1000);
                          duration = secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`;
                        } else if (stage.status === "in_progress" && stage.started_at) {
                          const secs = Math.round((Date.now() - new Date(stage.started_at).getTime()) / 1000);
                          duration = secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s...` : `${secs}s...`;
                        }
                        const resource = RESOURCES[i % RESOURCES.length];

                        return (
                          <div
                            key={stage.task_id || i}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                              padding: "10px 12px",
                              borderRadius: "8px",
                              background:
                                stage.status === "in_progress" ? "rgba(232, 168, 56, 0.06)" :
                                stage.status === "failed" ? "rgba(212, 84, 84, 0.06)" :
                                "transparent",
                              border:
                                stage.status === "in_progress" ? "1px solid rgba(232, 168, 56, 0.15)" :
                                stage.status === "failed" ? "1px solid rgba(212, 84, 84, 0.15)" :
                                "1px solid transparent",
                            }}
                          >
                            {/* Hex status indicator */}
                            <div
                              style={{
                                width: "22px",
                                height: "25px",
                                clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "10px",
                                flexShrink: 0,
                                background:
                                  stage.status === "completed" ? resource.color :
                                  stage.status === "in_progress" ? "var(--accent)" :
                                  stage.status === "failed" ? "var(--error)" :
                                  "var(--bg-secondary)",
                                color:
                                  stage.status === "pending" || stage.status === "skipped"
                                    ? "var(--text-muted)" : "#1a1410",
                              }}
                            >
                              {stage.status === "completed" ? "✓" :
                               stage.status === "in_progress" ? "◉" :
                               stage.status === "failed" ? "✕" : ""}
                            </div>

                            {/* Stage info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                fontSize: "13px",
                                fontWeight: stage.status === "in_progress" ? 600 : 400,
                                color:
                                  stage.status === "completed" ? "var(--text-secondary)" :
                                  stage.status === "in_progress" ? "var(--text-primary)" :
                                  stage.status === "failed" ? "var(--error)" :
                                  "var(--text-muted)",
                                textTransform: "capitalize",
                              }}>
                                {stage.description || stage.name}
                              </div>

                              {/* Completed stage summary */}
                              {stage.status === "completed" && stage.outputs && (
                                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "3px", fontFamily: "JetBrains Mono, monospace" }}>
                                  {stage.outputs.papers && `Found ${stage.outputs.papers.length} papers`}
                                  {stage.outputs.directions && `Generated ${stage.outputs.directions.length} directions`}
                                  {stage.outputs.text_summary && !stage.outputs.papers && !stage.outputs.directions &&
                                    (stage.outputs.text_summary as string).slice(0, 80) + ((stage.outputs.text_summary as string).length > 80 ? "..." : "")}
                                </div>
                              )}

                              {/* Active stage hint */}
                              {stage.status === "in_progress" && stage.name === "theory" && (
                                <div style={{ fontSize: "11px", color: "var(--accent)", marginTop: "3px", fontFamily: "JetBrains Mono, monospace" }}>
                                  Running proof loop (formalize → prove → verify → refine)... this can take 10-20 min
                                </div>
                              )}
                              {stage.status === "in_progress" && stage.name === "survey" && (
                                <div style={{ fontSize: "11px", color: "var(--accent)", marginTop: "3px", fontFamily: "JetBrains Mono, monospace" }}>
                                  Searching arXiv, Semantic Scholar, citation graphs...
                                </div>
                              )}
                              {stage.status === "in_progress" && stage.name === "writer" && (
                                <div style={{ fontSize: "11px", color: "var(--accent)", marginTop: "3px", fontFamily: "JetBrains Mono, monospace" }}>
                                  Assembling LaTeX paper from all artifacts...
                                </div>
                              )}

                              {stage.error_message && (
                                <div style={{ fontSize: "11px", color: "var(--error)", marginTop: "2px" }}>
                                  {stage.error_message}
                                </div>
                              )}
                            </div>

                            {/* Duration */}
                            {duration && (
                              <span style={{
                                fontSize: "11px",
                                fontFamily: "JetBrains Mono, monospace",
                                color: stage.status === "in_progress" ? "var(--accent)" : "var(--text-muted)",
                                flexShrink: 0,
                              }}>
                                {duration}
                              </span>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}

                {/* Legacy agent_steps fallback */}
                {(!runStatus.pipeline || runStatus.pipeline.length === 0) &&
                  runStatus.output_summary?.agent_steps?.map((step, i) => (
                    <div
                      key={i}
                      style={{
                        marginTop: "8px",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        background: "rgba(232, 168, 56, 0.05)",
                        fontSize: "13px",
                      }}
                    >
                      <span style={{ color: "var(--accent)" }}>
                        {step.agent}
                      </span>{" "}
                      — {step.summary}
                    </div>
                  ))
                }
              </div>
            ) : (
              <>
                {/* Progress bar with resource colors */}
                <div style={{ marginBottom: "32px" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "8px",
                    }}
                  >
                    <span
                      style={{ fontSize: "13px", color: "var(--text-muted)" }}
                    >
                      Pipeline Progress
                    </span>
                    <span
                      style={{
                        fontSize: "13px",
                        color: "var(--accent)",
                        fontFamily: "JetBrains Mono, monospace",
                      }}
                    >
                      {Math.min(
                        Math.round(
                          (fallbackStep / FALLBACK_STEPS.length) * 100
                        ),
                        100
                      )}
                      %
                    </span>
                  </div>
                  <div
                    style={{
                      height: "6px",
                      borderRadius: "3px",
                      background: "var(--bg-card)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      className="progress-stripe"
                      style={{
                        height: "100%",
                        width: `${Math.min(
                          (fallbackStep / FALLBACK_STEPS.length) * 100,
                          100
                        )}%`,
                        background:
                          "linear-gradient(90deg, #6b8c42, #e8c845, #c45c3e, #e8a838)",
                        borderRadius: "3px",
                        transition: "width 0.5s ease",
                      }}
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  {fallbackSteps.map((step, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "12px 16px",
                        borderRadius: "8px",
                        background:
                          step.status === "running"
                            ? "rgba(232, 168, 56, 0.05)"
                            : "transparent",
                        border:
                          step.status === "running"
                            ? "1px solid rgba(232, 168, 56, 0.15)"
                            : "1px solid transparent",
                      }}
                    >
                      <div
                        style={{
                          width: "20px",
                          height: "23px",
                          clipPath:
                            "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "10px",
                          flexShrink: 0,
                          background:
                            step.status === "done"
                              ? RESOURCES[i % RESOURCES.length].color
                              : step.status === "running"
                              ? "var(--accent)"
                              : "var(--bg-card)",
                          color:
                            step.status === "pending"
                              ? "var(--text-muted)"
                              : "#1a1410",
                          border:
                            step.status === "pending"
                              ? "1px solid var(--border)"
                              : "none",
                        }}
                      >
                        {step.status === "done"
                          ? "✓"
                          : step.status === "running"
                          ? "◉"
                          : ""}
                      </div>
                      <span
                        style={{
                          fontSize: "14px",
                          color:
                            step.status === "done"
                              ? "var(--text-secondary)"
                              : step.status === "running"
                              ? "var(--text-primary)"
                              : "var(--text-muted)",
                          fontFamily: "JetBrains Mono, monospace",
                        }}
                      >
                        {step.label}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ════════ RESULTS ════════ */}
        {screen === "results" && (
          <div
            className="screen-transition"
            style={{
              maxWidth: "900px",
              width: "100%",
              height: "calc(100vh - 130px)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "24px",
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: "22px",
                    fontWeight: 600,
                    marginBottom: "4px",
                    color: "var(--accent)",
                  }}
                >
                  Research Complete
                </h2>
                <p
                  style={{ color: "var(--text-secondary)", fontSize: "14px" }}
                >
                  LaTeX manuscript ready for &ldquo;{topic}&rdquo;
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={copyLatex}
                  style={{
                    padding: "10px 20px",
                    borderRadius: "8px",
                    border: "1px solid var(--accent)",
                    background: "transparent",
                    color: "var(--accent)",
                    fontSize: "14px",
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseOver={(e) => {
                    (e.target as HTMLButtonElement).style.background = "rgba(232, 168, 56, 0.1)";
                  }}
                  onMouseOut={(e) => {
                    (e.target as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  Copy LaTeX
                </button>
                <button
                  onClick={startNewResearch}
                  style={{
                    padding: "10px 20px",
                    borderRadius: "8px",
                    border: "none",
                    background: "linear-gradient(135deg, #e8a838, #c45c3e)",
                    color: "#1a1410",
                    fontSize: "14px",
                    fontWeight: 700,
                    cursor: "pointer",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                  }}
                >
                  New Research
                </button>
              </div>
            </div>

            {/* Stats as resource cards */}
            <div
              style={{
                display: "flex",
                gap: "16px",
                marginBottom: "24px",
                flexWrap: "wrap",
              }}
            >
              {[
                {
                  label: "Backend",
                  value: backendOnline ? "EurekaClaw Live" : "Offline Mode",
                  resource: RESOURCES[0],
                },
                {
                  label: "Pipeline",
                  value: "EurekaClaw + AutoResearch",
                  resource: RESOURCES[1],
                },
                {
                  label: "Output",
                  value: "LaTeX Paper",
                  resource: RESOURCES[2],
                },
                {
                  label: "Status",
                  value: "Ready for Review",
                  resource: RESOURCES[4],
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    flex: "1 1 140px",
                    padding: "14px 18px",
                    borderRadius: "10px",
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderTop: `3px solid ${stat.resource.color}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      marginBottom: "4px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span>{stat.resource.icon}</span>
                    {stat.label}
                  </div>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: stat.resource.color,
                    }}
                  >
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>

            {/* LaTeX output */}
            <div
              style={{
                flex: 1,
                borderRadius: "12px",
                border: "1px solid var(--border)",
                background: "rgba(26, 20, 16, 0.9)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  padding: "10px 16px",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "rgba(51, 38, 28, 0.5)",
                }}
              >
                <span
                  style={{
                    fontSize: "13px",
                    color: "var(--text-muted)",
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                >
                  manuscript.tex
                </span>
                <span style={{ fontSize: "11px", color: "var(--success)" }}>
                  ● Generated
                </span>
              </div>
              <pre
                style={{
                  flex: 1,
                  margin: 0,
                  padding: "16px",
                  overflow: "auto",
                  fontSize: "13px",
                  lineHeight: "1.6",
                  color: "var(--text-secondary)",
                  fontFamily: "JetBrains Mono, monospace",
                }}
              >
                {latexOutput}
              </pre>
            </div>

            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--text-muted)",
                  fontFamily: "JetBrains Mono, monospace",
                }}
              >
                In Runx-1 We Trust — Khalese Lab Helper v1.0
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
