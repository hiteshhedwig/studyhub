import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import type { ReviewRating } from "../db/repositories/types";

export type ReviewInput = {
  rating: ReviewRating;
  currentMastery: number;
  /**
   * Consecutive successful reviews so far (a "forgot" resets it to 0). Drives how
   * far good/easy push the next interval, so a card you keep failing can't graduate
   * to a long interval just because it has been seen many times.
   */
  successStreak: number;
  reviewedAt?: Date;
  /**
   * Exam / target date. When set and still in the future, intervals are clamped to
   * about half the remaining days so every card gets re-seen (ramping up) before it.
   * Null/past = no effect (pure adaptive scheduling).
   */
  targetDate?: Date | null;
};

export type ReviewResult = {
  masteryScore: number;
  nextDueAt: string;
  intervalDays: number;
};

const topicIntervals = [1, 3, 7, 14, 30, 60];

/** Hard ceiling on question review intervals (interview-prep horizon). */
const MAX_INTERVAL_DAYS = 30;

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function calculateQuestionReview(input: ReviewInput): ReviewResult {
  const reviewedAt = input.reviewedAt ?? new Date();
  const streak = input.successStreak;
  // Interview-prep tuning: tighter bands, every interval capped at 30 days so a
  // card never disappears for months before an interview. Growth is keyed to the
  // success streak (consecutive non-forgot), never raw review count.
  const rawInterval =
    input.rating === "forgot"
      ? 1
      : input.rating === "hard"
        ? 3
        : input.rating === "good"
          ? streak >= 5
            ? 30
            : streak >= 4
              ? 22
              : streak >= 3
                ? 14
                : streak >= 2
                  ? 8
                  : 5
          : streak >= 4
            ? 30
            : streak >= 3
              ? 21
              : streak >= 2
                ? 14
                : 10;
  let intervalDays = Math.min(rawInterval, MAX_INTERVAL_DAYS);

  // Exam mode: never schedule a card more than ~half the remaining days out, so it
  // gets re-reviewed (with the gap shrinking) as the date nears. No-op when far
  // away (half of >60d already exceeds the 30d cap) or once the date has passed.
  if (input.targetDate) {
    const daysUntil = differenceInCalendarDays(input.targetDate, reviewedAt);
    if (daysUntil > 0) {
      intervalDays = Math.min(intervalDays, Math.max(1, Math.floor(daysUntil / 2)));
    }
  }

  const delta = input.rating === "forgot" ? -14 : input.rating === "hard" ? 4 : input.rating === "good" ? 10 : 16;
  return {
    masteryScore: clamp(input.currentMastery + delta),
    intervalDays,
    nextDueAt: addDays(reviewedAt, intervalDays).toISOString()
  };
}

type DueQuestion = { review_count: number; next_due_at: string; last_reviewed_at: string | null };

/**
 * Whether a question is due now, accounting for exam mode WITHOUT rewriting any
 * stored date. Never-reviewed cards are always due. Under an active future
 * targetDate, a reviewed card's effective due date is pulled in to
 * `lastReviewed + floor(daysUntilExam / 2)` when that's sooner than its stored
 * due date — so far-future cards resurface as the exam approaches. With no
 * target date (or a past one) this is just the normal stored-schedule check.
 */
export function isQuestionDue(question: DueQuestion, targetDate: Date | null, now: Date = new Date()): boolean {
  if (question.review_count === 0) return true;
  let effectiveDue = parseISO(question.next_due_at);
  if (targetDate && question.last_reviewed_at) {
    const daysUntil = differenceInCalendarDays(targetDate, now);
    // Apply the clamp up to and including exam day (>= 0). On exam day daysUntil is 0,
    // so gapCap floors at 1 (final cram) — old cards surface, but a card reviewed today
    // stays due tomorrow, not immediately. A past date (< 0) ignores exam mode entirely.
    if (daysUntil >= 0) {
      const gapCap = Math.max(1, Math.floor(daysUntil / 2));
      const examDue = addDays(parseISO(question.last_reviewed_at), gapCap);
      if (examDue < effectiveDue) effectiveDue = examDue;
    }
  }
  return differenceInCalendarDays(effectiveDue, now) <= 0;
}

export function createTopicRevisionDates(startedAt: Date = new Date()): string[] {
  return topicIntervals.map((days) => addDays(startedAt, days).toISOString());
}

export function topicRevisionIntervals() {
  return [...topicIntervals];
}
