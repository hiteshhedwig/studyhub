import { addDays } from "date-fns";
import type { ReviewRating } from "../db/repositories/types";

export type ReviewInput = {
  rating: ReviewRating;
  currentMastery: number;
  reviewCount: number;
  reviewedAt?: Date;
};

export type ReviewResult = {
  masteryScore: number;
  nextDueAt: string;
  intervalDays: number;
};

const topicIntervals = [1, 3, 7, 14, 30, 60];

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function calculateQuestionReview(input: ReviewInput): ReviewResult {
  const reviewedAt = input.reviewedAt ?? new Date();
  const count = input.reviewCount;
  const intervalDays =
    input.rating === "forgot"
      ? 1
      : input.rating === "hard"
        ? 3
        : input.rating === "good"
          ? count >= 6
            ? 60
            : count >= 4
              ? 30
              : count >= 2
                ? 14
                : 7
          : count >= 5
            ? 90
            : count >= 3
              ? 60
              : count >= 1
                ? 30
                : 14;

  const delta = input.rating === "forgot" ? -14 : input.rating === "hard" ? 4 : input.rating === "good" ? 10 : 16;
  return {
    masteryScore: clamp(input.currentMastery + delta),
    intervalDays,
    nextDueAt: addDays(reviewedAt, intervalDays).toISOString()
  };
}

export function createTopicRevisionDates(startedAt: Date = new Date()): string[] {
  return topicIntervals.map((days) => addDays(startedAt, days).toISOString());
}

export function topicRevisionIntervals() {
  return [...topicIntervals];
}
