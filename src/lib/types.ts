export interface ResearchConfig {
  topic: string;
  domain: string;
  mode: "exploration" | "detailed" | "reference";
  query: string;
  additionalContext: string;
  paperIds?: string[];
}

export interface PipelineStage {
  task_id: string;
  name: string;
  agent_role: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
  description: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string;
}

export interface RunStatus {
  run_id: string;
  status: "queued" | "running" | "pausing" | "paused" | "resuming" | "completed" | "failed";
  name: string;
  error: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  paused_stage: string;
  eureka_session_id: string;
  input_spec: Record<string, unknown>;
  output_dir: string;
  pipeline?: PipelineStage[];
  output_summary: {
    latex_paper?: string;
    pdf_path?: string;
    bibliography_json?: string;
    theory_state_json?: string;
    research_brief_json?: string;
    eval_report_json?: string;
    skills_distilled?: string[];
    agent_steps?: AgentStep[];
  };
}

export interface AgentStep {
  agent: string;
  stage: string;
  status: string;
  summary: string;
  started_at?: string;
  completed_at?: string;
}

export type AppScreen = "login" | "topic" | "clarify" | "research" | "results";

export type GenerateEvent =
  | { type: "step"; step: number }
  | { type: "latex"; chunk: string }
  | { type: "done" }
  | { type: "error"; message: string };
