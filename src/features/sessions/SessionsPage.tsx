import { format, parseISO } from "date-fns";
import { Trash2 } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { useAppStore } from "../../store/appStore";

export function SessionsPage() {
  const store = useAppStore();
  const sessions = store.sessions;
  return (
    <>
      <PageHeader title="Sessions" eyebrow="A quiet record of your focused work and reflections." />
      {sessions.length === 0 ? <EmptyState>Completed sessions will appear here after you finish your first focus block.</EmptyState> : null}
      <section className="list">
        {sessions.map((session) => (
          <article className="card" key={session.id}>
            <div className="split">
              <div>
                <h2>{session.title}</h2>
                <p className="muted">{session.topic_title} · {format(parseISO(session.started_at), "MMM d, yyyy h:mm a")}</p>
              </div>
              <div className="button-row"><span className="pill">{session.pomodoros_completed} pomodoros</span><button className="btn danger" onClick={() => { if (confirm(`Delete session "${session.title}"?`)) void store.deleteSession(session.id); }}><Trash2 size={17} />Delete</button></div>
            </div>
            {session.notes ? <p>{session.notes}</p> : null}
            {session.reflection ? <p className="muted">{session.reflection}</p> : null}
          </article>
        ))}
      </section>
    </>
  );
}
