import { addMonths, eachDayOfInterval, endOfMonth, format, isPast, isSameDay, isToday, parseISO, startOfMonth } from "date-fns";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BrainCircuit, ChevronLeft, ChevronRight, FileText } from "lucide-react";
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

function RevisionCard({ revision, actionable, hasQuestions, note }: { revision: RevisionSchedule; actionable: boolean; hasQuestions?: boolean; note?: string }) {
  const completeRevision = useAppStore((state) => state.completeRevision);
  const navigate = useNavigate();
  return (
    <article className={`revision-card ${intervalClass(revision)} ${actionable ? "actionable" : ""}`}>
      <div className="split">
        <div>
          <strong>{revision.topic_title}</strong>
          <p className="muted">{revision.type.replace("_", " ")} · {format(parseISO(revision.due_at), "MMM d, yyyy")}</p>
        </div>
        <span className="pill">{intervalClass(revision).replace("day", "D").replace("week", "W").replace("month", "M")}</span>
      </div>
      {actionable ? (
        hasQuestions ? (
          // Recall-first: the primary action runs active recall on this topic's
          // cards in Practice, which is where the review gets marked complete.
          // Notes are deliberately the secondary "peek".
          <div className="button-row" style={{ marginTop: 4 }}>
            <button
              className="btn primary"
              type="button"
              onClick={() => navigate(`/practice?topic=${revision.topic_id}&review=${revision.id}`)}
            >
              <BrainCircuit size={16} /> Recall this topic
            </button>
            <Link className="btn" to={`/topics/${revision.topic_id}`}><FileText size={16} /> Open notes</Link>
          </div>
        ) : (
          // No questions yet — fall back to self-reported recall, still recall-first.
          <>
            <p className="muted" style={{ margin: "4px 0 0" }}>Recall this topic from memory, then rate how it went.</p>
            <RatingButtons onRate={(rating) => void completeRevision(revision.id, rating)} />
            <Link className="btn small" to={`/topics/${revision.topic_id}`} style={{ justifySelf: "start" }}><FileText size={14} /> Open notes</Link>
          </>
        )
      ) : note ? <p className="muted">{note}</p> : null}
    </article>
  );
}

const MAX_DOTS = 3;

export function RevisionsPage() {
  const { revisions, questions } = useAppStore();
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const topicsWithQuestions = useMemo(() => new Set(questions.map((question) => question.topic_id)), [questions]);
  const pending = revisions.filter((item) => item.status === "pending");
  const dueToday = pending.filter((item) => isToday(parseISO(item.due_at)));
  const late = pending.filter((item) => isPast(parseISO(item.due_at)) && !isToday(parseISO(item.due_at)));
  const upcoming = pending.filter((item) => !isPast(parseISO(item.due_at)) && !isToday(parseISO(item.due_at)));
  const completed = revisions.filter((item) => item.status === "completed");
  const days = useMemo(() => eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }), [month]);

  const selectedRevisions = useMemo(() => {
    if (!selectedDay) return [];
    return revisions.filter((revision) => isSameDay(parseISO(revision.due_at), selectedDay));
  }, [revisions, selectedDay]);

  return (
    <>
      <PageHeader title="Topic Reviews" eyebrow="Recall first, then check. Only due or late reviews are actionable — upcoming items stay as a quiet map." />
      <section className="grid two revisions-layout">
        <div className="card grid">
          <h2>Due today</h2>
          {dueToday.length ? dueToday.map((revision) => <RevisionCard key={revision.id} revision={revision} actionable hasQuestions={topicsWithQuestions.has(revision.topic_id)} />) : <EmptyState>No topic reviews are due today.</EmptyState>}
        </div>
        <div className="card grid">
          <h2>Late</h2>
          {late.length ? late.map((revision) => <RevisionCard key={revision.id} revision={revision} actionable hasQuestions={topicsWithQuestions.has(revision.topic_id)} />) : <EmptyState>No missed pending reviews.</EmptyState>}
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
            <button className="btn" onClick={() => { setMonth(addMonths(month, -1)); setSelectedDay(null); }} aria-label="Previous month"><ChevronLeft size={17} /></button>
            <h2>{format(month, "MMMM yyyy")}</h2>
            <button className="btn" onClick={() => { setMonth(addMonths(month, 1)); setSelectedDay(null); }} aria-label="Next month"><ChevronRight size={17} /></button>
          </div>
          <div className="revision-calendar">
            {days.map((day) => {
              const dayItems = revisions.filter((revision) => isSameDay(parseISO(revision.due_at), day));
              const overflow = Math.max(0, dayItems.length - MAX_DOTS);
              const isSelected = selectedDay ? isSameDay(selectedDay, day) : false;
              const isInteractive = dayItems.length > 0;
              return (
                <div
                  key={day.toISOString()}
                  className={`calendar-day ${isToday(day) ? "today" : ""} ${isInteractive ? "has-items" : ""} ${isSelected ? "selected" : ""}`}
                  onClick={isInteractive ? () => setSelectedDay(isSelected ? null : day) : undefined}
                  role={isInteractive ? "button" : undefined}
                  tabIndex={isInteractive ? 0 : undefined}
                  onKeyDown={isInteractive ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedDay(isSelected ? null : day);
                    }
                  } : undefined}
                  title={dayItems.map((r) => r.topic_title).join(", ") || undefined}
                >
                  <strong>{format(day, "d")}</strong>
                  {dayItems.slice(0, MAX_DOTS).map((revision) => (
                    <span key={revision.id} className={`calendar-dot ${intervalClass(revision)}`} />
                  ))}
                  {overflow > 0 ? <span className="calendar-more">+{overflow}</span> : null}
                </div>
              );
            })}
          </div>
          {selectedDay ? (
            <div className="grid" style={{ gap: 8, marginTop: 4 }}>
              <div className="split">
                <strong>{format(selectedDay, "EEEE, MMMM d")}</strong>
                <button className="btn small" onClick={() => setSelectedDay(null)}>Clear</button>
              </div>
              {selectedRevisions.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>Nothing scheduled.</p>
              ) : (
                selectedRevisions.map((revision) => (
                  <RevisionCard
                    key={revision.id}
                    revision={revision}
                    actionable={revision.status === "pending" && (isToday(parseISO(revision.due_at)) || isPast(parseISO(revision.due_at)))}
                    hasQuestions={topicsWithQuestions.has(revision.topic_id)}
                    note={revision.status === "completed" ? "Completed." : undefined}
                  />
                ))
              )}
            </div>
          ) : null}
        </div>
      </section>

      <section className="card grid" style={{ marginTop: 20 }}>
        <h2>Completed</h2>
        {completed.length ? completed.slice(0, 8).map((revision) => <RevisionCard key={revision.id} revision={revision} actionable={false} note="Completed." />) : <EmptyState>Completed revisions will appear here.</EmptyState>}
      </section>
    </>
  );
}
