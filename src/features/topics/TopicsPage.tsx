import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, BookOpen, ChevronLeft, ExternalLink, FileText, Minus, MessageSquare, Trash2, Video } from "lucide-react";
import { topicHasLateRevision, topicTrend, type Trend } from "../../services/statsService";
import { formatDistanceToNow, parseISO } from "date-fns";
import { PageHeader } from "../../components/ui/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { useAppStore } from "../../store/appStore";
import { confirmDialog, toast } from "../../store/uiStore";
import { openLocalPath } from "../../services/fileStorage";
import { RevisionHistoryTimeline, summarizeRevisions } from "../../components/ui/RevisionHistoryTimeline";

function formatMinutes(total: number) {
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function TrendArrow({ trend }: { trend: Trend }) {
  const Icon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const label = trend === "up" ? "Improving" : trend === "down" ? "Slipping" : "Holding";
  return (
    <span className={`trend trend-${trend}`} title={label} aria-label={label}>
      <Icon size={14} />
    </span>
  );
}

export function TopicsPage() {
  const store = useAppStore();
  const navigate = useNavigate();
  const { topics, sessions, questions, revisions } = store;

  async function deleteTopic(topicId: string, title: string) {
    const ok = await confirmDialog({
      title: `Delete "${title}"?`,
      message: "Removes the topic and every session, cheatsheet link, question, and revision attached to it.",
      confirmLabel: "Delete topic",
      tone: "danger"
    });
    if (!ok) return;
    await store.deleteTopic(topicId);
    toast.success("Topic deleted.");
  }

  return (
    <>
      <PageHeader title="Topics" eyebrow="Knowledge homes for everything you are learning." />
      {topics.length === 0 ? <EmptyState>Create a topic from Today to begin building your study map.</EmptyState> : null}
      <section className="grid three">
        {topics.map((topic) => {
          const topicSessions = sessions.filter((session) => session.topic_id === topic.id);
          const topicQuestions = questions.filter((question) => question.topic_id === topic.id);
          const pending = revisions.filter((revision) => revision.topic_id === topic.id && revision.status === "pending").length;
          const trend = topicTrend(topic.id, revisions);
          const isLate = topicHasLateRevision(topic.id, revisions);
          const edgeClass = isLate ? "edge-danger" : topic.status === "mastered" ? "edge-mastered" : "";
          return (
            <article
              className={`card link ${edgeClass}`}
              key={topic.id}
              tabIndex={0}
              role="link"
              onClick={(event) => {
                // Don't navigate if the click landed on the delete button.
                if ((event.target as HTMLElement).closest("button")) return;
                navigate(`/topics/${topic.id}`);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  navigate(`/topics/${topic.id}`);
                }
              }}
            >
              <div className="split">
                <span className="pill" style={{ borderColor: topic.category_color }}>{topic.category_name}</span>
                <button
                  className="btn danger icon"
                  aria-label={`Delete ${topic.title}`}
                  onClick={(event) => { event.stopPropagation(); void deleteTopic(topic.id, topic.title); }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <h2 style={{ margin: "8px 0 0 0", display: "flex", alignItems: "center", gap: 8 }}>
                <span className="truncate">{topic.title}</span>
                {trend ? <TrendArrow trend={trend} /> : null}
              </h2>
              <p className="muted">{topic.description || "No description yet."}</p>
              <div className="progress"><span style={{ width: `${topic.mastery_score}%` }} /></div>
              <div className="split muted" style={{ fontSize: "var(--text-sm)" }}>
                <span>{topicSessions.length} sessions</span>
                <span>{topicQuestions.length} questions</span>
                <span>{pending} due</span>
              </div>
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

  if (!topic) return (
    <>
      <Link to="/topics" className="breadcrumb"><ChevronLeft size={14} /> Topics</Link>
      <EmptyState>Topic not found.</EmptyState>
    </>
  );

  const topicSessions = sessions.filter((session) => session.topic_id === topic.id);
  const totalMinutes = topicSessions.reduce((sum, session) => sum + session.focus_minutes * session.pomodoros_completed, 0);
  const topicSheets = cheatsheets.filter((item) => item.topic_id === topic.id);
  const topicSets = questionSets.filter((item) => item.topic_id === topic.id);
  const topicQuestions = questions.filter((item) => item.topic_id === topic.id);
  const topicRevisions = revisions.filter((item) => item.topic_id === topic.id);
  const topicLinks = links.filter((item) => item.topic_id === topic.id);

  return (
    <>
      <Link to="/topics" className="breadcrumb"><ChevronLeft size={14} /> Topics</Link>
      <PageHeader title={topic.title} eyebrow={`${topic.category_name} · ${topic.status}`} />
      <section className="grid three">
        <div className="card stat"><span className="muted">Mastery</span><strong>{topic.mastery_score}%</strong></div>
        <div className="card stat"><span className="muted">Focused time</span><strong>{formatMinutes(totalMinutes)}</strong></div>
        <div className="card stat"><span className="muted">Next revision</span><strong>{topic.next_revision_at ? formatDistanceToNow(parseISO(topic.next_revision_at), { addSuffix: true }) : "None"}</strong></div>
      </section>
      <section className="grid two" style={{ marginTop: 20 }}>
        <div className="card">
          <h2>Sessions</h2>
          {topicSessions.length ? (
            <div className="list">
              {topicSessions.map((session) => (
                <div className="list-item" key={session.id}>
                  <div className="split">
                    <span>{session.title}</span>
                    <span className="muted">{session.pomodoros_completed} pomodoros</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState>No sessions yet.</EmptyState>}
        </div>

        <div className="card">
          <h2>Cheatsheets</h2>
          {topicSheets.length ? (
            <div className="list">
              {topicSheets.map((sheet) => (
                <div className="list-item" key={sheet.id}>
                  <div className="split">
                    <span className="truncate" title={sheet.file_path}>{sheet.title}</span>
                    <button className="btn small" onClick={() => void openLocalPath(sheet.file_path)}><ExternalLink size={14} />Open</button>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState>No cheatsheets yet.</EmptyState>}
        </div>

        <div className="card">
          <h2>Question sets</h2>
          {topicSets.length ? (
            <div className="list">
              {topicSets.map((set) => {
                const count = topicQuestions.filter((q) => q.question_set_id === set.id).length;
                return (
                  <div className="list-item" key={set.id}>
                    <div className="split">
                      <span>{set.title}</span>
                      <span className="muted">{count} questions</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <EmptyState>No question sets yet.</EmptyState>}
        </div>

        <div className="card">
          <h2>Active recall</h2>
          {topicQuestions.length ? (
            <div className="list">
              {topicQuestions.slice(0, 8).map((q) => (
                <div className="list-item" key={q.id}>
                  <div className="split">
                    <span className="truncate" title={q.question}>{q.question}</span>
                    <span className="muted">{q.mastery_score}%</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState>No questions yet.</EmptyState>}
        </div>

        <div className="card grid">
          <h2>Revision timeline</h2>
          {(() => {
            const completedHistory = topicRevisions
              .filter((r) => r.status === "completed" && r.completed_at)
              .sort((a, b) => (a.completed_at! < b.completed_at! ? -1 : 1));
            const upcoming = topicRevisions
              .filter((r) => r.status === "pending")
              .sort((a, b) => (a.due_at < b.due_at ? -1 : 1));
            if (completedHistory.length === 0 && upcoming.length === 0) {
              return <EmptyState>No revisions scheduled.</EmptyState>;
            }
            return (
              <>
                {completedHistory.length ? (
                  <>
                    <p className="muted" style={{ margin: 0 }}>{completedHistory.length} past review{completedHistory.length === 1 ? "" : "s"} · {summarizeRevisions(completedHistory)}</p>
                    <RevisionHistoryTimeline history={completedHistory} ariaLabel={`Past revisions for ${topic.title}`} />
                  </>
                ) : <p className="muted" style={{ margin: 0 }}>No past reviews yet.</p>}
                {upcoming.length ? (
                  <div className="list" style={{ marginTop: 8 }}>
                    {upcoming.slice(0, 5).map((revision) => (
                      <div className="list-item" key={revision.id}>
                        <div className="split">
                          <span>{formatDistanceToNow(parseISO(revision.due_at), { addSuffix: true })}</span>
                          <span className="muted">upcoming</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            );
          })()}
        </div>

        <div className="card">
          <h2>Resource links</h2>
          {topicLinks.length ? (
            <div className="list">
              {topicLinks.map((link) => {
                const Icon = link.kind === "chatgpt" ? MessageSquare
                  : link.kind === "video" ? Video
                  : link.kind === "docs" ? FileText
                  : link.kind === "article" ? BookOpen
                  : ExternalLink;
                return (
                  <div className="list-item" key={link.id}>
                    <div className="split">
                      <span className="truncate" title={link.url}>
                        <Icon size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
                        {link.title || link.url}
                      </span>
                      <button className="btn small" onClick={() => void openLocalPath(link.url)} title={link.url}>
                        <ExternalLink size={14} />Open
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <EmptyState>No links yet.</EmptyState>}
        </div>
      </section>
    </>
  );
}
