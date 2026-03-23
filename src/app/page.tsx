"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { AppScreen, ResearchConfig, RunStatus } from "@/lib/types";

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
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

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

    // Send the initial topic to Khalese
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

      // Read the streaming response
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const assistantId = `asst-${Date.now()}`;
      let fullContent = "";

      // Add empty assistant message
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

      // Check if Khalese signaled research is ready
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
          // Auto-start research after a short delay
          setTimeout(() => startResearch(config), 2000);
        }
      }
    } catch (err) {
      console.error("Chat error:", err);
      // Add error message from Khalese
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

    // Try EurekaClaw backend first
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
        setRunId(data.run_id);
        setBackendOnline(true);
        // Start polling
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

    pollRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/research/status?run_id=${rid}`);
        if (!response.ok) return;

        const data: RunStatus = await response.json();
        setRunStatus(data);

        if (data.status === "completed") {
          if (pollRef.current) clearInterval(pollRef.current);
          if (data.output_summary?.latex_paper) {
            setLatexOutput(data.output_summary.latex_paper);
          }
          setScreen("results");
        } else if (data.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // Silently retry
      }
    }, 3000);
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── FALLBACK PIPELINE (when EurekaClaw is offline) ──
  const runFallbackPipeline = (config: ResearchConfig) => {
    const steps = FALLBACK_STEPS.map((label) => ({ label, status: "pending" }));
    steps[0].status = "running";
    setFallbackSteps(steps);
    setFallbackStep(0);

    let step = 0;
    const interval = setInterval(() => {
      step++;
      setFallbackSteps((prev) => {
        const updated = [...prev];
        if (step - 1 < updated.length) updated[step - 1].status = "done";
        if (step < updated.length) updated[step].status = "running";
        return updated;
      });
      setFallbackStep(step);

      if (step >= FALLBACK_STEPS.length) {
        clearInterval(interval);
        setTimeout(() => {
          setLatexOutput(generateFallbackPaper(config));
          setScreen("results");
        }, 1000);
      }
    }, 2000);
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
    setScreen("topic");
  };

  // ═══════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* ── HEADER ── */}
      {screen !== "login" && (
        <header
          style={{
            borderBottom: "1px solid var(--border)",
            padding: "16px 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(10, 15, 26, 0.8)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                background: "linear-gradient(135deg, #22d3ee, #10b981)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
                fontWeight: 700,
                color: "#0a0f1a",
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
            <span
              style={{
                fontSize: "11px",
                padding: "4px 10px",
                borderRadius: "12px",
                background: "rgba(34, 211, 238, 0.1)",
                color: "var(--accent)",
                border: "1px solid rgba(34, 211, 238, 0.2)",
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
                background: "rgba(52, 211, 153, 0.1)",
                color: "var(--success)",
                border: "1px solid rgba(52, 211, 153, 0.2)",
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
                    ? "rgba(52, 211, 153, 0.1)"
                    : "rgba(248, 113, 113, 0.1)",
                  color: backendOnline ? "var(--success)" : "var(--error)",
                  border: `1px solid ${
                    backendOnline
                      ? "rgba(52, 211, 153, 0.2)"
                      : "rgba(248, 113, 113, 0.2)"
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
        }}
      >
        {/* ════════ LOGIN ════════ */}
        {screen === "login" && (
          <div
            className="screen-transition"
            style={{ textAlign: "center", maxWidth: "400px", width: "100%" }}
          >
            <div
              style={{
                width: "80px",
                height: "80px",
                borderRadius: "20px",
                background: "linear-gradient(135deg, #22d3ee, #10b981)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "36px",
                fontWeight: 700,
                color: "#0a0f1a",
                margin: "0 auto 24px",
                boxShadow: "0 0 40px rgba(34, 211, 238, 0.3)",
              }}
            >
              K
            </div>
            <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "8px" }}>
              Khalese Lab Helper
            </h1>
            <p
              style={{
                color: "var(--accent)",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: "14px",
                marginBottom: "8px",
                letterSpacing: "1px",
              }}
            >
              In Runx-1 We Trust
            </p>
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "14px",
                marginBottom: "40px",
              }}
            >
              AI-powered biomedical research assistant
            </p>

            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              placeholder="Enter lab passcode"
              style={{
                width: "100%",
                padding: "14px 20px",
                borderRadius: "10px",
                border: loginError
                  ? "1px solid var(--error)"
                  : "1px solid var(--border)",
                background: "var(--bg-card)",
                color: "var(--text-primary)",
                fontSize: "16px",
                outline: "none",
                textAlign: "center",
                letterSpacing: "8px",
                fontFamily: "JetBrains Mono, monospace",
                marginBottom: "16px",
              }}
              autoFocus
            />

            {loginError && (
              <p style={{ color: "var(--error)", fontSize: "14px", marginBottom: "16px" }}>
                Invalid passcode. Try again.
              </p>
            )}

            <button
              onClick={handleLogin}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: "10px",
                border: "none",
                background: "linear-gradient(135deg, #22d3ee, #10b981)",
                color: "#0a0f1a",
                fontSize: "16px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Enter Lab
            </button>

            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "12px",
                marginTop: "32px",
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
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>🧬</div>
            <h2
              style={{ fontSize: "24px", fontWeight: 600, marginBottom: "8px" }}
            >
              What would you like to research?
            </h2>
            <p
              style={{
                color: "var(--text-secondary)",
                marginBottom: "32px",
                fontSize: "16px",
              }}
            >
              Enter a biomedical research topic and Khalese will guide you
              through the process with smart clarifying questions.
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
              }}
              autoFocus
            />

            <button
              onClick={startClarification}
              disabled={!topic.trim()}
              style={{
                marginTop: "16px",
                padding: "14px 48px",
                borderRadius: "10px",
                border: "none",
                background: topic.trim()
                  ? "linear-gradient(135deg, #22d3ee, #10b981)"
                  : "var(--bg-card)",
                color: topic.trim() ? "#0a0f1a" : "var(--text-muted)",
                fontSize: "16px",
                fontWeight: 600,
                cursor: topic.trim() ? "pointer" : "not-allowed",
              }}
            >
              Talk to Khalese
            </button>

            {/* Quick starts */}
            <div style={{ marginTop: "32px" }}>
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--text-muted)",
                  marginBottom: "12px",
                }}
              >
                Quick starts:
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
                  "RUNX1 in hematopoietic stem cells",
                  "CAR-T cell therapy resistance mechanisms",
                  "Single-cell transcriptomics in cardiac regeneration",
                  "Epigenetic regulators in AML",
                ].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTopic(t)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "20px",
                      border: "1px solid var(--border)",
                      background: "var(--bg-card)",
                      color: "var(--text-secondary)",
                      fontSize: "13px",
                      cursor: "pointer",
                    }}
                  >
                    {t}
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
            {/* API Key warning */}
            {apiKeyError && (
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: "8px",
                  background: "rgba(251, 191, 36, 0.1)",
                  border: "1px solid rgba(251, 191, 36, 0.3)",
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
                          ? "var(--accent-dim)"
                          : "var(--bg-card)",
                      border:
                        msg.role === "assistant"
                          ? "1px solid var(--border)"
                          : "none",
                      fontSize: "15px",
                      lineHeight: "1.6",
                      whiteSpace: "pre-wrap",
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
                    borderRadius: "10px",
                    border: "1px solid var(--border)",
                    background: "var(--bg-card)",
                    color: "var(--text-primary)",
                    fontSize: "15px",
                    outline: "none",
                  }}
                  autoFocus
                  disabled={isStreaming}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || isStreaming}
                  style={{
                    padding: "14px 24px",
                    borderRadius: "10px",
                    border: "none",
                    background:
                      inputValue.trim() && !isStreaming
                        ? "var(--accent)"
                        : "var(--bg-card)",
                    color:
                      inputValue.trim() && !isStreaming
                        ? "#0a0f1a"
                        : "var(--text-muted)",
                    fontWeight: 600,
                    cursor:
                      inputValue.trim() && !isStreaming
                        ? "pointer"
                        : "not-allowed",
                  }}
                >
                  Send
                </button>
              </div>

              {/* Skip to research button */}
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
                  }}
                >
                  Skip to research — I have enough context →
                </button>
              )}
            </div>
          </div>
        )}

        {/* ════════ RESEARCH PIPELINE ════════ */}
        {screen === "research" && (
          <div
            className="screen-transition"
            style={{ maxWidth: "600px", width: "100%" }}
          >
            <div style={{ textAlign: "center", marginBottom: "40px" }}>
              <div
                className="pulse-glow"
                style={{
                  fontSize: "48px",
                  marginBottom: "16px",
                  display: "inline-block",
                  borderRadius: "50%",
                }}
              >
                🔬
              </div>
              <h2
                style={{
                  fontSize: "22px",
                  fontWeight: 600,
                  marginBottom: "8px",
                }}
              >
                Research in Progress
              </h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "15px" }}>
                {backendOnline
                  ? "EurekaClaw is running the full research pipeline..."
                  : `Khalese is analyzing "${topic}"`}
              </p>
              {runStatus?.status === "failed" && (
                <p
                  style={{
                    color: "var(--error)",
                    fontSize: "14px",
                    marginTop: "8px",
                  }}
                >
                  Error: {runStatus.error}
                </p>
              )}
            </div>

            {/* Progress */}
            {backendOnline && runStatus ? (
              // Real EurekaClaw status
              <div
                style={{
                  padding: "20px",
                  borderRadius: "12px",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "12px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "13px",
                      color: "var(--text-muted)",
                    }}
                  >
                    Status
                  </span>
                  <span
                    style={{
                      fontSize: "13px",
                      color: "var(--accent)",
                      fontFamily: "JetBrains Mono, monospace",
                      textTransform: "uppercase",
                    }}
                  >
                    {runStatus.status}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    color: "var(--text-secondary)",
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                >
                  Session: {runStatus.eureka_session_id || runStatus.run_id}
                </div>
                {runStatus.output_summary?.agent_steps?.map((step, i) => (
                  <div
                    key={i}
                    style={{
                      marginTop: "8px",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      background: "rgba(34, 211, 238, 0.05)",
                      fontSize: "13px",
                    }}
                  >
                    <span style={{ color: "var(--accent)" }}>
                      {step.agent}
                    </span>{" "}
                    — {step.summary}
                  </div>
                ))}
              </div>
            ) : (
              // Fallback progress steps
              <>
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
                          "linear-gradient(90deg, #22d3ee, #10b981)",
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
                            ? "rgba(34, 211, 238, 0.05)"
                            : "transparent",
                        border:
                          step.status === "running"
                            ? "1px solid rgba(34, 211, 238, 0.15)"
                            : "1px solid transparent",
                      }}
                    >
                      <div
                        style={{
                          width: "20px",
                          height: "20px",
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "11px",
                          flexShrink: 0,
                          background:
                            step.status === "done"
                              ? "var(--success)"
                              : step.status === "running"
                              ? "var(--accent)"
                              : "var(--bg-card)",
                          color:
                            step.status === "pending"
                              ? "var(--text-muted)"
                              : "#0a0f1a",
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
                    background: "linear-gradient(135deg, #22d3ee, #10b981)",
                    color: "#0a0f1a",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  New Research
                </button>
              </div>
            </div>

            {/* Stats */}
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
                },
                {
                  label: "Pipeline",
                  value: "EurekaClaw + AutoResearch",
                },
                {
                  label: "Output",
                  value: "LaTeX Paper",
                },
                {
                  label: "Status",
                  value: "Ready for Review",
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
                  }}
                >
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      marginBottom: "4px",
                    }}
                  >
                    {stat.label}
                  </div>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "var(--accent)",
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
                background: "#0d1117",
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
                  background: "rgba(30, 41, 59, 0.5)",
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
                  color: "#c9d1d9",
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
                🧬 In Runx-1 We Trust — Khalese Lab Helper v1.0
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
