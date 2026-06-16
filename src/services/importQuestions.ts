import { z } from "zod";

const codeTestCaseSchema = z.object({
  description: z.string(),
  setup: z.string().default(""),
  call: z.string().default(""),
  expected_shape: z.array(z.number()).optional(),
  expected_value: z.string().optional()
});

export const questionImportSchema = z.object({
  category: z.string().min(1, "Category is required"),
  topic: z.string().min(1, "Topic is required"),
  title: z.string().min(1, "Set title is required"),
  source: z.string().min(1).default("ChatGPT"),
  questions: z
    .array(
      z.object({
        question: z.string().min(1, "Question text is required"),
        // Recall questions: provide answer. Code questions: provide solution instead.
        answer: z.string().default(""),
        type: z.enum(["recall", "code"]).default("recall"),
        kind: z.enum(["warmup", "implementation"]).optional(),
        framework: z.enum(["numpy", "torch"]).optional(),
        language: z.string().optional(),
        starter_code: z.string().optional(),
        solution: z.string().optional(),
        test_cases: z.array(codeTestCaseSchema).optional(),
        difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
        tags: z.array(z.string()).default([])
      })
    )
    .min(1, "At least one question is required")
});

export type QuestionImport = z.infer<typeof questionImportSchema>;

export function parseQuestionImport(jsonText: string): { ok: true; data: QuestionImport } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    const result = questionImportSchema.safeParse(parsed);
    if (!result.success) {
      return { ok: false, error: result.error.issues.map((issue) => `${issue.path.join(".") || "file"}: ${issue.message}`).join("\n") };
    }
    return { ok: true, data: result.data };
  } catch {
    return { ok: false, error: "This file is not valid JSON. Export or paste a plain JSON object with category, topic, title, source, and questions." };
  }
}
