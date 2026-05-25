import { describe, expect, it } from "vitest";
import { calculateQuestionReview, createTopicRevisionDates } from "./spacedRepetition";

describe("spaced repetition", () => {
  const reviewedAt = new Date("2026-05-25T10:00:00.000Z");

  it("schedules forgotten questions for tomorrow and lowers mastery", () => {
    const result = calculateQuestionReview({ rating: "forgot", currentMastery: 40, reviewCount: 2, reviewedAt });
    expect(result.intervalDays).toBe(1);
    expect(result.masteryScore).toBe(26);
    expect(result.nextDueAt).toBe("2026-05-26T10:00:00.000Z");
  });

  it("grows good and easy intervals gently with review count", () => {
    expect(calculateQuestionReview({ rating: "good", currentMastery: 50, reviewCount: 4, reviewedAt }).intervalDays).toBe(30);
    expect(calculateQuestionReview({ rating: "easy", currentMastery: 50, reviewCount: 5, reviewedAt }).intervalDays).toBe(90);
  });

  it("creates topic revision milestones", () => {
    const dates = createTopicRevisionDates(reviewedAt);
    expect(dates).toHaveLength(6);
    expect(dates[0]).toBe("2026-05-26T10:00:00.000Z");
    expect(dates[5]).toBe("2026-07-24T10:00:00.000Z");
  });
});
