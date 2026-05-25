import { Link, useParams } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { PageHeader } from "../../components/ui/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { useAppStore } from "../../store/appStore";

export function TopicsPage() {
  const store = useAppStore();
  const { topics, sessions, questions, revisions } = store;

  return (
    <>
      <PageHeader title="Topics" eyebrow="Knowledge homes for everything you are learning." />
      {topics.length === 0 ? <EmptyState>Create a topic from Today to begin building your study map.</EmptyState> : null}
      <section className="grid three">
        {topics.map((topic) => {
          const topicSessions = sessions.filter((session) => session.topic_id === topic.id);
          const topicQuestions = questions.filter((question) => question.topic_id === topic.id);
          const pending = revisions.filter((revision) => revision.topic_id === topic.id && revision.status === "pending").length;
          return (
            <article className="card" key={topic.id}>
              <span className="pill" style={{ borderColor: topic.category_color }}>{topic.category_name}</span>
              <div className="split"><Link to={`/topics/${topic.id}`} style={{ textDecoration: "none" }}><h2>{topic.title}</h2></Link><button className="btn danger icon" aria-label="Delete topic" onClick={() => { if (confirm(`Delete topic "${topic.title}" and all its sessions, cheatsheets, questions, and revisions?`)) void store.deleteTopic(topic.id); }}><Trash2 size={16} /></button></div>
              <p className="muted">{topic.description || "No description yet."}</p>
              <div className="progress"><span style={{ width: `${topic.mastery_score}%` }} /></div>
              <div className="split muted"><span>{topicSessions.length} sessions</span><span>{topicQuestions.length} questions</span><span>{pending} due</span></div>
            </article>
          );
        })}
      </section>
    </>
  );
}

export function TopicDetailPage() {
  const { topicId } = useParams();
  const { topics, sessions, cheatsheets, questionSets, questions, revisions, links } = useAppStore();
  const topic = topics.find((item) => item.id === topicId);

  if (!topic) return <EmptyState>Topic not found.</EmptyState>;

  const topicSessions = sessions.filter((session) => session.topic_id === topic.id);
  const totalMinutes = topicSessions.reduce((sum, session) => sum + session.focus_minutes * session.pomodoros_completed, 0);

  return (
    <>
      <PageHeader title={topic.title} eyebrow={`${topic.category_name} · ${topic.status}`} />
      <section className="grid three">
        <div className="card stat"><span className="muted">Mastery</span><strong>{topic.mastery_score}%</strong></div>
        <div className="card stat"><span className="muted">Focused time</span><strong>{totalMinutes}m</strong></div>
        <div className="card stat"><span className="muted">Next revision</span><strong>{topic.next_revision_at ? formatDistanceToNow(parseISO(topic.next_revision_at), { addSuffix: true }) : "None"}</strong></div>
      </section>
      <section className="grid two" style={{ marginTop: 20 }}>
        <div className="card"><h2>Sessions</h2><List items={topicSessions.map((session) => `${session.title} · ${session.pomodoros_completed} pomodoros`)} /></div>
        <div className="card"><h2>Cheatsheets</h2><List items={cheatsheets.filter((item) => item.topic_id === topic.id).map((item) => item.title)} /></div>
        <div className="card"><h2>Question sets</h2><List items={questionSets.filter((item) => item.topic_id === topic.id).map((item) => item.title)} /></div>
        <div className="card"><h2>Active recall</h2><List items={questions.filter((item) => item.topic_id === topic.id).slice(0, 8).map((item) => item.question)} /></div>
        <div className="card"><h2>Revision timeline</h2><List items={revisions.filter((item) => item.topic_id === topic.id).map((item) => `${formatDistanceToNow(parseISO(item.due_at), { addSuffix: true })} · ${item.status}`)} /></div>
        <div className="card"><h2>Resource links</h2><List items={links.filter((item) => item.topic_id === topic.id).map((item) => item.title)} /></div>
      </section>
    </>
  );
}

function List({ items }: { items: string[] }) {
  return items.length ? <div className="list">{items.map((item, index) => <div className="list-item" key={`${item}-${index}`}>{item}</div>)}</div> : <EmptyState>Nothing here yet.</EmptyState>;
}
