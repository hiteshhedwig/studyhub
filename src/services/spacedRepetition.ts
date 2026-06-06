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

/** Default size of a topic-review recall set — a quick check, not the whole bank. */
export const TOPIC_REVIEW_SIZE = 12;

type ReviewSetQuestion = DueQuestion & { id: string; topic_id: string; mastery_score: number };

function lastReviewedMs(question: ReviewSetQuestion): number {
  // Never-seen sort oldest-first (0) so they lead the "oldest seen" tail.
  return question.last_reviewed_at ? parseISO(question.last_reviewed_at).getTime() : 0;
}

/**
 * Builds the recall set for a topic review: due cards first (the questions that
 * genuinely need active recall now), then the weakest by mastery, then the
 * oldest-seen — capped at `cap` so a review stays a quick memory check rather
 * than a full study session. Order is deterministic (not shuffled) so the most
 * important cards lead.
 */
export function buildTopicReviewSet<T extends ReviewSetQuestion>(
  questions: T[],
  topicId: string,
  targetDate: Date | null,
  now: Date = new Date(),
  cap: number = TOPIC_REVIEW_SIZE
): T[] {
  const inTopic = questions.filter((question) => question.topic_id === topicId);
  const due = inTopic.filter((question) => isQuestionDue(question, targetDate, now));
  const dueIds = new Set(due.map((question) => question.id));
  const rest = inTopic
    .filter((question) => !dueIds.has(question.id))
    .sort((a, b) =>
      a.mastery_score !== b.mastery_score
        ? a.mastery_score - b.mastery_score
        : lastReviewedMs(a) - lastReviewedMs(b)
    );
  return [...due, ...rest].slice(0, cap);
}

const REVIEW_RATING_SCALE: Record<ReviewRating, number> = { forgot: 1, hard: 2, good: 3, easy: 4 };
const REVIEW_RATING_BY_SCORE: ReviewRating[] = ["forgot", "forgot", "hard", "good", "easy"]; // index 0 unused; 1→forgot … 4→easy

/**
 * Collapses how the individual cards went in a topic-review session into a single
 * rating to log against the review — the rounded mean of the cards on a 1–4 scale
 * (forgot=1 … easy=4), so the label reflects how the whole session went rather than
 * the single weakest card. Topic-review intervals are fixed, so this is recorded for
 * history (the timeline chip + Slipping trend) rather than used to reschedule.
 * Empty (no cards rated) defaults to "good".
 */
export function aggregateReviewRating(ratings: ReviewRating[]): ReviewRating {
  if (ratings.length === 0) return "good";
  const mean = ratings.reduce((sum, rating) => sum + REVIEW_RATING_SCALE[rating], 0) / ratings.length;
  return REVIEW_RATING_BY_SCORE[Math.round(mean)];
}

export function createTopicRevisionDates(startedAt: Date = new Date()): string[] {
  return topicIntervals.map((days) => addDays(startedAt, days).toISOString());
}

export function topicRevisionIntervals() {
  return [...topicIntervals];
}
