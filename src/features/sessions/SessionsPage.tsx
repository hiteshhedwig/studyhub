import { useMemo, useState } from "react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { Trash2 } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { useAppStore } from "../../store/appStore";
import { confirmDialog, toast } from "../../store/uiStore";
import type { StudySession } from "../../db/repositories/types";

function dayLabel(iso: string) {
  const date = parseISO(iso);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEEE, MMMM d, yyyy");
}

function dayKey(iso: string) {
  return format(parseISO(iso), "yyyy-MM-dd");
}

export function SessionsPage() {
  const store = useAppStore();
  const [topicFilter, setTopicFilter] = useState("");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return store.sessions.filter((session) => {
      if (topicFilter && session.topic_id !== topicFilter) return false;
      if (!q) return true;
      return `${session.title} ${session.topic_title} ${session.notes ?? ""} ${session.reflection ?? ""}`.toLowerCase().includes(q);
    });
  }, [store.sessions, topicFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; items: StudySession[] }>();
    for (const session of filtered) {
      const key = dayKey(session.started_at);
      if (!map.has(key)) map.set(key, { label: dayLabel(session.started_at), items: [] });
      map.get(key)!.items.push(session);
    }
    return Array.from(map.values());
  }, [filtered]);

  async function deleteSession(session: StudySession) {
    const ok = await confirmDialog({
      title: `Delete "${session.title}"?`,
      message: "Its notes, reflection, and pomodoro count will be removed. Attached cheatsheets and questions remain on the topic.",
      confirmLabel: "Delete session",
      tone: "danger"
    });
    if (!ok) return;
    await store.deleteSession(session.id);
    toast.success("Session deleted.");
  }

  return (
    <>
      <PageHeader title="Sessions" eyebrow="A quiet record of your focused work and reflections." />
      {store.sessions.length > 0 ? (
        <div className="card button-row">
          <input className="input" style={{ maxWidth: 320 }} placeholder="Search title, notes, reflection" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select className="select" style={{ maxWidth: 260 }} value={topicFilter} onChange={(event) => setTopicFilter(event.target.value)}>
            <option value="">All topics</option>
            {store.topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}
          </select>
        </div>
      ) : null}
      {store.sessions.length === 0 ? <EmptyState>Completed sessions will appear here after you finish your first focus block.</EmptyState> : null}
      {store.sessions.length > 0 && filtered.length === 0 ? <EmptyState>No sessions match this filter.</EmptyState> : null}
      <section style={{ marginTop: 20, display: "grid", gap: 28 }}>
        {grouped.map((group) => (
          <div key={group.label} className="grid" style={{ gap: 12 }}>
            <h3 className="muted" style={{ margin: 0, fontSize: "var(--text-sm)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{group.label}</h3>
            <div className="list">
              {group.items.map((session) => (
                <article className="card" key={session.id}>
                  <div className="split">
                    <div>
                      <h2>{session.title}</h2>
                      <p className="muted">{session.topic_title} · {format(parseISO(session.started_at), "h:mm a")}</p>
                    </div>
                    <div className="button-row">
                      <span className="pill">{session.pomodoros_completed} pomodoros</span>
                      <button className="btn danger icon" aria-label={`Delete session ${session.title}`} onClick={() => void deleteSession(session)}><Trash2 size={16} /></button>
                    </div>
                  </div>
                  {session.notes ? <p>{session.notes}</p> : null}
                  {session.reflection ? <p className="muted">{session.reflection}</p> : null}
                </article>
              ))}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
