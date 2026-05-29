import { eachDayOfInterval, endOfWeek, format, isSameDay, parseISO, startOfDay, startOfWeek, subDays, subWeeks } from "date-fns";
import type { Question, RevisionSchedule, ReviewRating, StudySession, Topic } from "../db/repositories/types";

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
