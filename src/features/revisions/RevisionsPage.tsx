import { addMonths, eachDayOfInterval, endOfMonth, format, isPast, isSameDay, isToday, parseISO, startOfMonth } from "date-fns";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { RatingButtons } from "../../components/ui/RatingButtons";
import { useAppStore } from "../../store/appStore";
import type { RevisionSchedule } from "../../db/repositories/types";

function intervalClass(revision: RevisionSchedule) {
  const created = parseISO(revision.created_at);
  const due = parseISO(revision.due_at);
  const days = Math.max(1, Math.round((due.getTime() - created.getTime()) / 86_400_000));
  if (days <= 1) return "day1";
  if (days <= 3) return "day3";
  if (days <= 7) return "week1";
  if (days <= 14) return "week2";
  if (days <= 30) return "month1";
  return "month2";
}

function RevisionCard({ revision, actionable, note }: { revision: RevisionSchedule; actionable: boolean; note?: string }) {
  const completeRevision = useAppStore((state) => state.completeRevision);
  return (
    <article className={`revision-card ${intervalClass(revision)} ${actionable ? "actionable" : ""}`}>
      <div className="split">
        <div>
          <strong>{revision.topic_title}</strong>
          <p className="muted">{revision.type.replace("_", " ")} · {format(parseISO(revision.due_at), "MMM d, yyyy")}</p>
        </div>
        <span className="pill">{intervalClass(revision).replace("day", "D").replace("week", "W").replace("month", "M")}</span>
      </div>
      {actionable ? <RatingButtons onRate={(rating) => void completeRevision(revision.id, rating)} /> : note ? <p className="muted">{note}</p> : null}
    </article>
  );
}

export function RevisionsPage() {
  const { revisions } = useAppStore();
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const pending = revisions.filter((item) => item.status === "pending");
  const dueToday = pending.filter((item) => isToday(parseISO(item.due_at)));
  const late = pending.filter((item) => isPast(parseISO(item.due_at)) && !isToday(parseISO(item.due_at)));
  const upcoming = pending.filter((item) => !isPast(parseISO(item.due_at)) && !isToday(parseISO(item.due_at)));
  const completed = revisions.filter((item) => item.status === "completed");
  const days = useMemo(() => eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }), [month]);

  return (
    <>
      <PageHeader title="Revisions" eyebrow="Only due or late revisions are actionable. Upcoming items stay as a quiet map." />
      <section className="grid two revisions-layout">
        <div className="card grid">
          <h2>Due today</h2>
          {dueToday.length ? dueToday.map((revision) => <RevisionCard key={revision.id} revision={revision} actionable />) : <EmptyState>No topic revisions are due today.</EmptyState>}
        </div>
        <div className="card grid">
          <h2>Late</h2>
          {late.length ? late.map((revision) => <RevisionCard key={revision.id} revision={revision} actionable />) : <EmptyState>No missed pending revisions.</EmptyState>}
        </div>
      </section>

      <section className="grid two revisions-layout" style={{ marginTop: 20 }}>
        <div className="card grid">
          <div className="split">
            <h2>Upcoming</h2>
            <span className="pill">{upcoming.length} planned</span>
          </div>
          {upcoming.length ? (
            <div className="revision-scroll-list" aria-label="Upcoming revisions">
              {upcoming.map((revision) => <RevisionCard key={revision.id} revision={revision} actionable={false} />)}
            </div>
          ) : <EmptyState>Nothing upcoming yet.</EmptyState>}
        </div>

        <div className="card grid revision-calendar-card">
          <div className="split">
            <button className="btn" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft size={17} /></button>
            <h2>{format(month, "MMMM yyyy")}</h2>
            <button className="btn" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight size={17} /></button>
          </div>
          <div className="revision-calendar">
            {days.map((day) => {
              const dayItems = revisions.filter((revision) => isSameDay(parseISO(revision.due_at), day));
              return (
                <div className={`calendar-day ${isToday(day) ? "today" : ""}`} key={day.toISOString()}>
                  <strong>{format(day, "d")}</strong>
                  {dayItems.slice(0, 3).map((revision) => <span key={revision.id} className={`calendar-dot ${intervalClass(revision)}`} title={revision.topic_title} />)}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="card grid" style={{ marginTop: 20 }}>
        <h2>Completed</h2>
        {completed.length ? completed.slice(0, 8).map((revision) => <RevisionCard key={revision.id} revision={revision} actionable={false} note="Completed." />) : <EmptyState>Completed revisions will appear here.</EmptyState>}
      </section>
    </>
  );
}
