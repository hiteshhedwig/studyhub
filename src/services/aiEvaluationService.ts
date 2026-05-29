import { z } from "zod";
import type { ReviewRating } from "../db/repositories/types";
import { getAiEvalConfig } from "./preferencesService";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 30000;

const SYSTEM_PROMPT = `Grade a student's active-recall answer against the canonical answer for interview prep.
Reward correct meaning, not exact wording. Penalize missing key points, wrong claims, and vague interview phrasing.
If the student answer is blank, return verdict "blank", score 0, recall_grade "forgot".
Be concise: at most 3 short bullets per list (<=12 words each); interview_feedback <= 1 sentence.
Return JSON only.`;

export const evaluationSchema = z.object({
  score: z.number().min(0).max(10),
  recall_grade: z.enum(["easy", "medium", "hard", "forgot"]),
  verdict: z.enum(["correct", "mostly_correct", "partially_correct", "mostly_incorrect", "incorrect", "blank"]),
  missed_points: z.array(z.string()),
  incorrect_points: z.array(z.string()),
  interview_feedback: z.string()
});

export type EvaluationResult = z.infer<typeof evaluationSchema>;

// OpenRouter / OpenAI structured-output JSON schema (mirrors evaluationSchema).
const RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["score", "recall_grade", "verdict", "missed_points", "incorrect_points", "interview_feedback"],
  properties: {
    score: { type: "number", minimum: 0, maximum: 10 },
    recall_grade: { type: "string", enum: ["easy", "medium", "hard", "forgot"] },
    verdict: {
      type: "string",
      enum: ["correct", "mostly_correct", "partially_correct", "mostly_incorrect", "incorrect", "blank"]
    },
    missed_points: { type: "array", items: { type: "string" } },
    incorrect_points: { type: "array", items: { type: "string" } },
    interview_feedback: { type: "string" }
  }
} as const;

/** The grading rubric uses "medium"; the SR rating buttons use "good". */
export function recallGradeToRating(grade: EvaluationResult["recall_grade"]): ReviewRating {
  return grade === "medium" ? "good" : grade;
}

/** Pull the first {...} JSON object out of a string, tolerating ``` fences and prose. */
function extractJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("No JSON object found in the response.");
  }
}

/** Light normalization so a near-miss reply still validates (string score, capitalized enums). */
function normalize(raw: unknown): unknown {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.score === "string") obj.score = Number(obj.score);
    if (typeof obj.recall_grade === "string") obj.recall_grade = obj.recall_grade.toLowerCase().trim();
    if (typeof obj.verdict === "string") obj.verdict = obj.verdict.toLowerCase().trim();
  }
  return raw;
}

export type EvaluateInput = { question: string; canonical: string; userAnswer: string };
export type EvaluateOutput = { ok: true; data: EvaluationResult } | { ok: false; error: string };

export async function evaluateAnswer(input: EvaluateInput): Promise<EvaluateOutput> {
  const config = getAiEvalConfig();
  if (!config.enabled) return { ok: false, error: "AI evaluation is turned off in Settings." };
  if (!config.apiKey) return { ok: false, error: "Add your OpenRouter API key in Settings to use AI evaluation." };

  const userContent = `Question:\n${input.question}\n\nCanonical answer:\n${input.canonical}\n\nStudent answer:\n${input.userAnswer.trim() || "(blank)"}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://study-hub.local",
        "X-Title": "Study Hub"
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent }
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "answer_evaluation", strict: true, schema: RESPONSE_JSON_SCHEMA }
        }
      })
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      if (response.status === 401) return { ok: false, error: "OpenRouter rejected the API key (401). Check it in Settings." };
      if (response.status === 429) return { ok: false, error: "Rate limited by OpenRouter (429). Try again in a moment." };
      return { ok: false, error: `OpenRouter error ${response.status}. ${detail.slice(0, 160)}`.trim() };
    }

    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return { ok: false, error: "The model returned an empty response." };

    const parsed = evaluationSchema.safeParse(normalize(extractJson(content)));
    if (!parsed.success) {
      // Most common cause: a ":free" model, which can't honour structured output.
      console.warn("[ai-eval] could not parse grade. raw model content:\n", content);
      return {
        ok: false,
        error: "Couldn't parse the AI grade — the model likely doesn't support structured output. Avoid \":free\" models (use e.g. google/gemini-2.0-flash-001) in Settings."
      };
    }
    return { ok: true, data: parsed.data };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, error: "The AI request timed out. Check your connection and try again." };
    }
    return { ok: false, error: error instanceof Error ? error.message : "The AI request failed." };
  } finally {
    clearTimeout(timer);
  }
}
