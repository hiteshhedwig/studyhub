import { eachDayOfInterval, format, isSameDay, parseISO, startOfDay, subDays } from "date-fns";
import type { Question, RevisionSchedule, StudySession, Topic } from "../db/repositories/types";

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
