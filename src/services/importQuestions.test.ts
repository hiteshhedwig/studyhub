import { describe, expect, it } from "vitest";
import { parseQuestionImport } from "./importQuestions";

describe("question import validation", () => {
  it("accepts the ChatGPT Q&A format", () => {
    const result = parseQuestionImport(
      JSON.stringify({
        category: "Machine Learning",
        topic: "Decision Trees",
        title: "Decision Trees Active Recall Set",
        source: "ChatGPT",
        questions: [{ question: "What is information gain?", answer: "A split quality measure.", difficulty: "medium", tags: ["entropy"] }]
      })
    );
    expect(result.ok).toBe(true);
  });

  it("returns a helpful error for invalid JSON shape", () => {
    const result = parseQuestionImport(JSON.stringify({ category: "", questions: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Category is required");
  });
});
