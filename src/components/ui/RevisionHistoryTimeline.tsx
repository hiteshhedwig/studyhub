import { format, parseISO } from "date-fns";
import type { RevisionSchedule } from "../../db/repositories/types";

function intervalLabel(revision: RevisionSchedule) {
  const days = Math.max(1, Math.round((parseISO(revision.due_at).getTime() - parseISO(revision.created_at).getTime()) / 86_400_000));
  if (days <= 1) return "D1";
  if (days <= 3) return "D3";
  if (days <= 7) return "W1";
  if (days <= 14) return "W2";
  if (days <= 30) return "M1";
  return "M2";
}

export function summarizeRevisions(history: RevisionSchedule[]) {
  if (history.length === 0) return "";
  const counts: Record<string, number> = { forgot: 0, hard: 0, good: 0, easy: 0 };
  history.forEach((r) => { if (r.rating) counts[r.rating]++; });
  const parts: string[] = [];
  if (counts.easy) parts.push(`${counts.easy} easy`);
  if (counts.good) parts.push(`${counts.good} good`);
  if (counts.hard) parts.push(`${counts.hard} hard`);
  if (counts.forgot) parts.push(`${counts.forgot} forgot`);
  return parts.join(" · ");
}

export function RevisionHistoryTimeline({ history, ariaLabel }: { history: RevisionSchedule[]; ariaLabel?: string }) {
  return (
    <div className="revision-history-timeline" aria-label={ariaLabel}>
      {history.map((revision) => (
        <div
          className={`revision-history-chip ${revision.rating ?? "good"}`}
          key={revision.id}
          title={`${format(parseISO(revision.completed_at ?? revision.due_at), "MMM d, yyyy")} · ${revision.rating ?? "—"}`}
        >
          <strong>{intervalLabel(revision)}</strong>
          <span>{revision.rating ?? "—"}</span>
          <small>{format(parseISO(revision.completed_at ?? revision.due_at), "MMM d")}</small>
        </div>
      ))}
    </div>
  );
}
