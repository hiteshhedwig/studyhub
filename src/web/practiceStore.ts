import { create } from "zustand";
import { persist } from "zustand/middleware";
import { calculateQuestionReview } from "../services/spacedRepetition";
import type { ReviewAttempt, ReviewRating } from "../db/repositories/types";
import type { ExportedQuestion } from "../db/repositories/studyRepository";

type PracticeState = {
  questions: ExportedQuestion[];
  attempts: ReviewAttempt[];
  examDate: string | null;
  loadedAt: string | null;
  load: (questions: ExportedQuestion[], examDate: string | null) => void;
  record: (questionId: string, rating: ReviewRating, userAnswer: string, seconds: number) => void;
  clearAttempts: () => void;
};

/**
 * The phone's local scheduling is only for this session's ordering — the desktop
 * "Import & merge" recomputes everything authoritatively from the merged history.
 * So a simple streak reconstructed from THIS device's attempts is good enough.
 */
export const usePracticeStore = create<PracticeState>()(
  persist(
    (set, get) => ({
      questions: [],
      attempts: [],
      examDate: null,
      loadedAt: null,
      load: (questions, examDate) => set({ questions, examDate, attempts: [], loadedAt: new Date().toISOString() }),
      record: (questionId, rating, userAnswer, seconds) => {
        const state = get();
        const question = state.questions.find((q) => q.id === questionId);
        if (!question) return;

        let streak = 0;
        for (let i = state.attempts.length - 1; i >= 0; i--) {
          const attempt = state.attempts[i];
          if (attempt.question_id !== questionId) continue;
          if (attempt.rating === "forgot") break;
          streak += 1;
        }

        const reviewedAt = new Date();
        const result = calculateQuestionReview({ rating, currentMastery: question.mastery_score, successStreak: streak, reviewedAt });
        const attempt: ReviewAttempt = {
          id: crypto.randomUUID(),
          question_id: questionId,
          reviewed_at: reviewedAt.toISOString(),
          rating,
          user_answer: userAnswer.trim() || null,
          was_correct: rating === "good" || rating === "easy" ? 1 : 0,
          time_spent_seconds: seconds
        };

        set({
          attempts: [...state.attempts, attempt],
          questions: state.questions.map((q) =>
            q.id === questionId
              ? { ...q, next_due_at: result.nextDueAt, mastery_score: result.masteryScore, review_count: q.review_count + 1, last_reviewed_at: attempt.reviewed_at }
              : q
          )
        });
      },
      clearAttempts: () => set({ attempts: [] })
    }),
    { name: "studyhub-web-practice" }
  )
);
