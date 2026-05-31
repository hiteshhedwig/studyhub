import { addDays } from "date-fns";
import { describe, expect, it } from "vitest";
import { aggregateReviewRating, buildTopicReviewSet, calculateQuestionReview, createTopicRevisionDates, isQuestionDue } from "./spacedRepetition";

describe("spaced repetition", () => {
  const reviewedAt = new Date("2026-05-25T10:00:00.000Z");

  it("schedules forgotten questions for tomorrow and lowers mastery", () => {
    const result = calculateQuestionReview({ rating: "forgot", currentMastery: 40, successStreak: 2, reviewedAt });
    expect(result.intervalDays).toBe(1);
    expect(result.masteryScore).toBe(26);
    expect(result.nextDueAt).toBe("2026-05-26T10:00:00.000Z");
  });

  it("returns hard cards in 3 days regardless of streak", () => {
    expect(calculateQuestionReview({ rating: "hard", currentMastery: 50, successStreak: 0, reviewedAt }).intervalDays).toBe(3);
    expect(calculateQuestionReview({ rating: "hard", currentMastery: 50, successStreak: 9, reviewedAt }).intervalDays).toBe(3);
  });

  it("grows good/medium intervals by streak, capped at 30 days", () => {
    const good = (s: number) => calculateQuestionReview({ rating: "good", currentMastery: 50, successStreak: s, reviewedAt }).intervalDays;
    expect(good(0)).toBe(5);
    expect(good(2)).toBe(8);
    expect(good(3)).toBe(14);
    expect(good(4)).toBe(22);
    expect(good(5)).toBe(30);
    expect(good(20)).toBe(30); // cap holds
  });

  it("grows easy intervals by streak, capped at 30 days", () => {
    const easy = (s: number) => calculateQuestionReview({ rating: "easy", currentMastery: 50, successStreak: s, reviewedAt }).intervalDays;
    expect(easy(0)).toBe(10);
    expect(easy(2)).toBe(14);
    expect(easy(3)).toBe(21);
    expect(easy(4)).toBe(30);
    expect(easy(9)).toBe(30); // cap holds
  });

  it("keeps a struggling card short after a lapse (streak reset to 0)", () => {
    expect(calculateQuestionReview({ rating: "good", currentMastery: 50, successStreak: 0, reviewedAt }).intervalDays).toBe(5);
  });

  it("exam mode clamps intervals to about half the time remaining", () => {
    const examIn = (days: number, rating: "good" | "easy", streak: number) =>
      calculateQuestionReview({ rating, currentMastery: 50, successStreak: streak, reviewedAt, targetDate: addDays(reviewedAt, days) }).intervalDays;
    expect(examIn(80, "easy", 4)).toBe(30); // far away: no effect (still the 30 cap)
    expect(examIn(20, "easy", 4)).toBe(10); // 30 clamped to floor(20/2)
    expect(examIn(8, "easy", 4)).toBe(4); // clamped to floor(8/2)
    expect(examIn(3, "good", 5)).toBe(1); // last days: daily cram
  });

  it("ignores a target date that has already passed", () => {
    const result = calculateQuestionReview({ rating: "easy", currentMastery: 50, successStreak: 4, reviewedAt, targetDate: addDays(reviewedAt, -5) });
    expect(result.intervalDays).toBe(30);
  });

  describe("isQuestionDue + exam mode", () => {
    const now = new Date("2026-05-25T10:00:00.000Z");
    const reviewed = (daysAgo: number, dueInDays: number, review_count = 3) => ({
      review_count,
      last_reviewed_at: addDays(now, -daysAgo).toISOString(),
      next_due_at: addDays(now, dueInDays).toISOString()
    });

    it("never-reviewed cards are always due", () => {
      expect(isQuestionDue({ review_count: 0, last_reviewed_at: null, next_due_at: addDays(now, 99).toISOString() }, null, now)).toBe(true);
    });

    it("normal mode: due only when the stored date has arrived", () => {
      expect(isQuestionDue(reviewed(2, 5), null, now)).toBe(false);
      expect(isQuestionDue(reviewed(10, -1), null, now)).toBe(true);
    });

    it("exam mode pulls a far-future card in as the date nears", () => {
      const card = reviewed(30, 60); // reviewed 30d ago, due 60d out
      expect(isQuestionDue(card, null, now)).toBe(false); // normally hidden
      expect(isQuestionDue(card, addDays(now, 40), now)).toBe(true); // exam in 40d: gapCap 20 → due
    });

    it("exam mode does NOT make a recently-reviewed card due immediately", () => {
      const card = reviewed(0, 30); // reviewed today
      expect(isQuestionDue(card, addDays(now, 40), now)).toBe(false);
    });

    it("a past target date behaves exactly like normal scheduling", () => {
      const card = reviewed(5, 10);
      expect(isQuestionDue(card, addDays(now, -3), now)).toBe(false);
    });

    it("on exam day (gapCap 1) surfaces older cards for a final pass", () => {
      // reviewed 5 days ago, normally hidden until 60 days out
      expect(isQuestionDue(reviewed(5, 60), now, now)).toBe(true);
    });

    it("on exam day a card reviewed today is not due again immediately", () => {
      // lastReviewed today + gapCap 1 = tomorrow → not yet due
      expect(isQuestionDue(reviewed(0, 30), now, now)).toBe(false);
    });
  });

  describe("buildTopicReviewSet", () => {
    const now = new Date("2026-05-25T10:00:00.000Z");
    const q = (id: string, topic_id: string, opts: { due?: boolean; mastery?: number; daysAgo?: number; never?: boolean } = {}) => ({
      id,
      topic_id,
      mastery_score: opts.mastery ?? 50,
      review_count: opts.never ? 0 : 3,
      last_reviewed_at: opts.never ? null : addDays(now, -(opts.daysAgo ?? 1)).toISOString(),
      next_due_at: addDays(now, opts.due ? -1 : 30).toISOString()
    });

    it("only includes the requested topic", () => {
      const set = buildTopicReviewSet([q("a", "t1"), q("b", "t2", { due: true })], "t1", null, now);
      expect(set.map((x) => x.id)).toEqual(["a"]);
    });

    it("puts due cards first, then weakest, then oldest-seen", () => {
      const set = buildTopicReviewSet(
        [
          q("strong", "t1", { mastery: 90, daysAgo: 1 }),
          q("weak", "t1", { mastery: 10, daysAgo: 1 }),
          q("due", "t1", { due: true }),
          q("oldSameMastery", "t1", { mastery: 90, daysAgo: 40 })
        ],
        "t1",
        null,
        now
      );
      // due leads; then weak (mastery 10); then the two mastery-90 by oldest-seen
      expect(set.map((x) => x.id)).toEqual(["due", "weak", "oldSameMastery", "strong"]);
    });

    it("caps the set size", () => {
      const many = Array.from({ length: 20 }, (_, i) => q(`q${i}`, "t1", { mastery: i }));
      expect(buildTopicReviewSet(many, "t1", null, now, 12)).toHaveLength(12);
    });
  });

  describe("aggregateReviewRating", () => {
    it("worst card wins", () => {
      expect(aggregateReviewRating(["good", "forgot", "easy"])).toBe("forgot");
      expect(aggregateReviewRating(["good", "hard", "easy"])).toBe("hard");
    });
    it("all-easy stays easy, mixed-good is good, empty is good", () => {
      expect(aggregateReviewRating(["easy", "easy"])).toBe("easy");
      expect(aggregateReviewRating(["good", "easy"])).toBe("good");
      expect(aggregateReviewRating([])).toBe("good");
    });
  });

  it("creates topic revision milestones", () => {
    const dates = createTopicRevisionDates(reviewedAt);
    expect(dates).toHaveLength(6);
    expect(dates[0]).toBe("2026-05-26T10:00:00.000Z");
    expect(dates[5]).toBe("2026-07-24T10:00:00.000Z");
  });
});
