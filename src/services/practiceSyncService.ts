import type { ExportedQuestion, ExportedTopicReview } from "../db/repositories/studyRepository";
import type { ReviewAttempt } from "../db/repositories/types";

// Lightweight JSON sync files exchanged with the phone practice app (via a shared
// cloud drive). Questions go out, practice attempts come back.
const QUESTIONS_TYPE = "studyhub-questions";
const PRACTICE_TYPE = "studyhub-practice";
const VERSION = 1;

export type QuestionsFile = { type: typeof QUESTIONS_TYPE; version: number; exported_at: string; exam_date: string | null; questions: ExportedQuestion[]; topic_reviews: ExportedTopicReview[] };
export type PracticeFile = { type: typeof PRACTICE_TYPE; version: number; exported_at: string; attempts: ReviewAttempt[] };

export function buildQuestionsFile(questions: ExportedQuestion[], examDate: string | null, topicReviews: ExportedTopicReview[] = []): string {
  const file: QuestionsFile = { type: QUESTIONS_TYPE, version: VERSION, exported_at: new Date().toISOString(), exam_date: examDate, questions, topic_reviews: topicReviews };
  return JSON.stringify(file, null, 2);
}

export function buildPracticeFile(attempts: ReviewAttempt[]): string {
  const file: PracticeFile = { type: PRACTICE_TYPE, version: VERSION, exported_at: new Date().toISOString(), attempts };
  return JSON.stringify(file, null, 2);
}

export function parseQuestionsFile(text: string): { ok: true; questions: ExportedQuestion[]; examDate: string | null; topicReviews: ExportedTopicReview[] } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }
  const file = data as Partial<QuestionsFile>;
  if (file?.type !== QUESTIONS_TYPE || !Array.isArray(file.questions)) {
    return { ok: false, error: "Not a Study Hub questions file (export it from the desktop app's Settings)." };
  }
  // topic_reviews is optional — files exported before this feature simply have no
  // topic reviews to surface, so default to an empty list rather than rejecting them.
  const topicReviews = Array.isArray(file.topic_reviews) ? (file.topic_reviews as ExportedTopicReview[]) : [];
  return { ok: true, questions: file.questions as ExportedQuestion[], examDate: (file.exam_date as string | null | undefined) ?? null, topicReviews };
}

export function parsePracticeFile(text: string): { ok: true; attempts: ReviewAttempt[] } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }
  const file = data as Partial<PracticeFile>;
  if (file?.type !== PRACTICE_TYPE || !Array.isArray(file.attempts)) {
    return { ok: false, error: "Not a Study Hub practice file (expected a phone practice export)." };
  }
  return { ok: true, attempts: file.attempts as ReviewAttempt[] };
}

export function practiceFileName(prefix: string): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${prefix}-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.json`;
}

/** Save text to a file — native dialog in Tauri, browser download on the web. */
export async function saveTextFile(suggestedName: string, text: string): Promise<boolean> {
  try {
    const { save } = await import("@tauri-apps/api/dialog");
    const { writeTextFile } = await import("@tauri-apps/api/fs");
    const path = await save({ defaultPath: suggestedName, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (typeof path !== "string") return false;
    await writeTextFile(path, text);
    return true;
  } catch {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = suggestedName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  }
}

/** Open and read a text file — native dialog in Tauri, file input on the web. */
export async function openTextFile(): Promise<string | null> {
  try {
    const { open } = await import("@tauri-apps/api/dialog");
    const { readTextFile } = await import("@tauri-apps/api/fs");
    const result = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (typeof result !== "string") return null;
    return await readTextFile(result);
  } catch {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.onchange = async () => {
        const selected = input.files?.[0];
        if (!selected) return resolve(null);
        resolve(await selected.text());
      };
      input.click();
    });
  }
}
