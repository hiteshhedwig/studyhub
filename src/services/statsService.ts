import { eachDayOfInterval, endOfWeek, format, isSameDay, parseISO, startOfDay, startOfWeek, subDays, subWeeks } from "date-fns";
import type { Question, RevisionSchedule, ReviewActivityRow, ReviewAttempt, ReviewRating, StudySession, Topic } from "../db/repositories/types";

// Mirrors the repo's per-card AFK clamp, applied again at read time so any
// pre-cap historical attempts (stored before the clamp existed) stay honest.
const CARD_CAP_SECONDS = 600;

const RATING_SCALE: Record<ReviewRating, number> = { forgot: 1, hard: 2, good: 3, easy: 4 };

export type Trend = "up" | "flat" | "down";

export function topicTrend(topicId: string, revisions: RevisionSchedule[]): Trend | null {
  const completed = revisions
    .filter((r) => r.topic_id === topicId && r.status === "completed" && r.rating && r.completed_at)
    .sort((a, b) => (a.completed_at! < b.completed_at! ? -1 : 1));
  if (completed.length < 3) return null;
  const avg = (items: RevisionSchedule[]) => items.reduce((s, r) => s + RATING_SCALE[r.rating!], 0) / items.length;
  const recent = completed.slice(-2);
  const prior = completed.slice(Math.max(0, completed.length - 4), completed.length - 2);
  if (prior.length === 0) return null;
  const delta = avg(recent) - avg(prior);
  if (delta >= 0.5) return "up";
  if (delta <= -0.5) return "down";
  return "flat";
}

export function topicHasLateRevision(topicId: string, revisions: RevisionSchedule[], now = new Date()) {
  return revisions.some((r) => {
    if (r.topic_id !== topicId || r.status !== "pending") return false;
    const due = parseISO(r.due_at);
    return due < startOfDay(now);
  });
}

export function currentFocusStreak(sessions: StudySession[], now = new Date()): number {
  const today = startOfDay(now);
  const days = new Set(sessions.filter((s) => s.focus_minutes * s.pomodoros_completed > 0).map((s) => format(parseISO(s.started_at), "yyyy-MM-dd")));
  // Allow today's absence — count from yesterday backward if today is empty.
  let cursor = days.has(format(today, "yyyy-MM-dd")) ? today : subDays(today, 1);
  let streak = 0;
  while (days.has(format(cursor, "yyyy-MM-dd"))) {
    streak += 1;
    cursor = subDays(cursor, 1);
  }
  return streak;
}

export type HeatmapCell = { date: Date; minutes: number; bucket: 0 | 1 | 2 | 3 | 4 };

export function focusHeatmap(sessions: StudySession[], weeks = 53, now = new Date()): HeatmapCell[][] {
  // Weeks run Sunday→Saturday to match GitHub's contribution graph.
  const end = endOfWeek(now, { weekStartsOn: 0 });
  const start = startOfWeek(subWeeks(now, weeks - 1), { weekStartsOn: 0 });
  const totals = new Map<string, number>();
  sessions.forEach((s) => {
    const key = format(parseISO(s.started_at), "yyyy-MM-dd");
    totals.set(key, (totals.get(key) ?? 0) + s.focus_minutes * s.pomodoros_completed);
  });
  const allDays = eachDayOfInterval({ start, end });
  const cols: HeatmapCell[][] = [];
  for (let i = 0; i < allDays.length; i += 7) {
    cols.push(allDays.slice(i, i + 7).map((day) => {
      const minutes = totals.get(format(day, "yyyy-MM-dd")) ?? 0;
      const bucket: HeatmapCell["bucket"] = minutes === 0 ? 0 : minutes <= 15 ? 1 : minutes <= 45 ? 2 : minutes <= 90 ? 3 : 4;
      return { date: day, minutes, bucket };
    }));
  }
  return cols;
}

// Same Sun→Sat grid as the focus heatmap, but intensity = minutes spent on
// active recall (free practice + topic reviews). Buckets are scaled down since
// a solid review day is minutes, not hours.
export function reviewHeatmap(rows: ReviewActivityRow[], weeks = 53, now = new Date()): HeatmapCell[][] {
  const end = endOfWeek(now, { weekStartsOn: 0 });
  const start = startOfWeek(subWeeks(now, weeks - 1), { weekStartsOn: 0 });
  const seconds = new Map<string, number>();
  rows.forEach((row) => {
    const key = format(parseISO(row.reviewed_at), "yyyy-MM-dd");
    seconds.set(key, (seconds.get(key) ?? 0) + Math.min(row.seconds, CARD_CAP_SECONDS));
  });
  const allDays = eachDayOfInterval({ start, end });
  const cols: HeatmapCell[][] = [];
  for (let i = 0; i < allDays.length; i += 7) {
    cols.push(allDays.slice(i, i + 7).map((day) => {
      const minutes = Math.round((seconds.get(format(day, "yyyy-MM-dd")) ?? 0) / 60);
      const bucket: HeatmapCell["bucket"] = minutes === 0 ? 0 : minutes <= 5 ? 1 : minutes <= 15 ? 2 : minutes <= 30 ? 3 : 4;
      return { date: day, minutes, bucket };
    }));
  }
  return cols;
}

export type TopicPracticeStats = {
  cards: number;
  minutes: number;
  accuracy: number | null;
  activeDays: number;
  lastPracticedAt: string | null;
};

/** All-time practice rollup for one topic, derived from its review attempts. */
export function topicPracticeStats(attempts: ReviewAttempt[]): TopicPracticeStats {
  if (attempts.length === 0) return { cards: 0, minutes: 0, accuracy: null, activeDays: 0, lastPracticedAt: null };
  const totalSeconds = attempts.reduce((sum, a) => sum + Math.min(a.time_spent_seconds, CARD_CAP_SECONDS), 0);
  const correct = attempts.reduce((sum, a) => sum + (a.was_correct ? 1 : 0), 0);
  const days = new Set(attempts.map((a) => format(parseISO(a.reviewed_at), "yyyy-MM-dd")));
  const lastPracticedAt = attempts.reduce((latest, a) => (a.reviewed_at > latest ? a.reviewed_at : latest), attempts[0].reviewed_at);
  return {
    cards: attempts.length,
    minutes: Math.round(totalSeconds / 60),
    accuracy: Math.round((correct / attempts.length) * 100),
    activeDays: days.size,
    lastPracticedAt
  };
}

export function dailyStudySeries(sessions: StudySession[], days = 14) {
  const end = startOfDay(new Date());
  const start = subDays(end, days - 1);
  return eachDayOfInterval({ start, end }).map((day) => {
    const minutes = sessions
      .filter((session) => session.ended_at && isSameDay(parseISO(session.started_at), day))
      .reduce((sum, session) => sum + session.focus_minutes * session.pomodoros_completed, 0);
    return { label: format(day, "MMM d"), minutes };
  });
}

export function recallAccuracy(questions: Question[]) {
  const reviewed = questions.filter((question) => question.review_count > 0);
  if (reviewed.length === 0) return 0;
  const score = reviewed.reduce((sum, question) => sum + question.mastery_score, 0) / reviewed.length;
  return Math.round(score);
}

export function revisionCompletionRate(revisions: RevisionSchedule[]) {
  const finished = revisions.filter((revision) => revision.status === "completed" || revision.status === "missed");
  if (finished.length === 0) return 0;
  return Math.round((finished.filter((revision) => revision.status === "completed").length / finished.length) * 100);
}

export function rankedTopics(topics: Topic[], direction: "weak" | "strong") {
  return [...topics].sort((a, b) => (direction === "weak" ? a.mastery_score - b.mastery_score : b.mastery_score - a.mastery_score)).slice(0, 5);
}
