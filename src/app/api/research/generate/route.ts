import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { NextRequest } from "next/server";

export const maxDuration = 300;

const RESEARCH_SYSTEM_PROMPT = `You are a senior biomedical research scientist generating a comprehensive LaTeX research paper. You produce publication-quality academic content with real biological mechanisms, pathway analyses, and properly formatted references.

## Output Protocol

You MUST structure your output in exactly this format:

1. First, emit progress markers as you work through each phase. Each marker must be on its own line:
   [STEP:0] (analyzing topic and key themes)
   [STEP:1] (surveying relevant literature)
   [STEP:2] (extracting key findings)
   [STEP:3] (identifying research gaps)
   [STEP:4] (generating hypotheses)
   [STEP:5] (cross-referencing pathways/databases)
   [STEP:6] (structuring narrative)
   [STEP:7] (beginning LaTeX generation)

2. After [STEP:7], emit the LaTeX document between these exact markers:
   [LATEX_START]
   \\documentclass[12pt]{article}
   ... full paper ...
   \\end{document}
   [LATEX_END]

3. Then emit final steps:
   [STEP:8] (quality check)
   [STEP:9] (finalized)

## Paper Requirements

- Full LaTeX document with \\documentclass, all necessary \\usepackage declarations
- Abstract (150-250 words) with clear hypothesis and findings summary
- Introduction with real biological context, signaling pathways, and molecular mechanisms
- Literature Review section citing real, well-known papers (use \\bibitem with inline bibliography)
- Methods section describing the analytical/computational approach
- Results and Discussion with genuine scientific analysis
- Novel Hypotheses section with mechanistic reasoning
- Future Directions
- Bibliography using \\begin{thebibliography} with at least 15 real references you are confident exist
- Use proper LaTeX formatting: \\textit for gene names, \\textbf for emphasis, math mode for equations
- Include the author line: Khalese Lab Helper, Generated via EurekaClaw + AutoResearch Pipeline, In Runx-1 We Trust

## Citation Guidelines

ONLY cite papers you are highly confident exist. Prefer:
- Seminal papers in the field (high-impact, well-known)
- Major review articles from Nature Reviews, Annual Reviews, etc.
- Landmark clinical trials or foundational studies
- Include realistic author names, journal names, years, and volume/page numbers

## Quality Standards

- Write at the level of a peer-reviewed journal article
- Include specific gene names, protein interactions, signaling cascades
- Discuss molecular mechanisms with precision
- Address limitations and alternative interpretations
- Maintain scientific rigor throughout`;

function buildUserPrompt(config: {
  topic: string;
  domain: string;
  mode: string;
  query: string;
  additionalContext?: string;
}): string {
  return `Generate a comprehensive research paper on the following:

**Topic:** ${config.topic}
**Domain:** ${config.domain}
**Research Mode:** ${config.mode}
**Query:** ${config.query}
${config.additionalContext ? `**Additional Context from researcher:** ${config.additionalContext}` : ""}

Begin with [STEP:0] and work through all steps. Generate a thorough, publication-quality LaTeX paper.`;
}

export async function POST(req: NextRequest) {
  try {
    const config = await req.json();

    const result = streamText({
      model: anthropic("claude-sonnet-4-6"),
      system: RESEARCH_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(config) }],
      temperature: 0.4,
      maxOutputTokens: 16000,
    });

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          let buffer = "";

          for await (const chunk of result.textStream) {
            buffer += chunk;

            // Process complete lines from buffer
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              // Check for step markers
              const stepMatch = line.match(/\[STEP:(\d+)\]/);
              if (stepMatch) {
                const event = JSON.stringify({
                  type: "step",
                  step: parseInt(stepMatch[1], 10),
                });
                controller.enqueue(
                  encoder.encode(`data: ${event}\n\n`)
                );
                continue;
              }

              // Check for latex markers
              if (line.includes("[LATEX_START]")) {
                continue;
              }
              if (line.includes("[LATEX_END]")) {
                continue;
              }

              // If we're between LATEX_START and LATEX_END or it's content, send it
              // We send all non-marker lines as latex content
              if (line.trim()) {
                const event = JSON.stringify({
                  type: "latex",
                  chunk: line + "\n",
                });
                controller.enqueue(
                  encoder.encode(`data: ${event}\n\n`)
                );
              }
            }
          }

          // Flush remaining buffer
          if (buffer.trim()) {
            const stepMatch = buffer.match(/\[STEP:(\d+)\]/);
            if (stepMatch) {
              const event = JSON.stringify({
                type: "step",
                step: parseInt(stepMatch[1], 10),
              });
              controller.enqueue(encoder.encode(`data: ${event}\n\n`));
            } else if (
              !buffer.includes("[LATEX_START]") &&
              !buffer.includes("[LATEX_END]")
            ) {
              const event = JSON.stringify({
                type: "latex",
                chunk: buffer + "\n",
              });
              controller.enqueue(encoder.encode(`data: ${event}\n\n`));
            }
          }

          // Signal done
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
          );
          controller.close();
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Unknown error";
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", message })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

    if (
      message.includes("API key") ||
      message.includes("authentication") ||
      message.includes("401")
    ) {
      return new Response(
        JSON.stringify({
          error: "ANTHROPIC_API_KEY is not configured.",
          code: "NO_API_KEY",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
