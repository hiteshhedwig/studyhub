import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, BookOpen, Check, ChevronLeft, ExternalLink, Feather, FileText, Minus, MessageSquare, Pencil, Quote, Trash2, Video } from "lucide-react";
import { sessionFocusMinutes, topicHasLateRevision, topicPracticeStats, topicTrend, type Trend } from "../../services/statsService";
import { format as formatDate, formatDistanceToNow, isThisWeek, isToday, isYesterday, parseISO } from "date-fns";
import { PageHeader } from "../../components/ui/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { QuestionScoreHeatmap } from "../../components/charts/QuestionScoreHeatmap";
import { useAppStore } from "../../store/appStore";
import { confirmDialog, toast } from "../../store/uiStore";
import { openLocalPath } from "../../services/fileStorage";
import { addTopicJournalEntry, deleteTopicJournalEntry, getTopicJournal, updateTopicJournalEntry } from "../../db/repositories/studyRepository";
import { RevisionHistoryTimeline, summarizeRevisions } from "../../components/ui/RevisionHistoryTimeline";
import type { ReviewAttempt, Topic, TopicJournalEntry } from "../../db/repositories/types";
import { formatMinutes } from "../../utils/formatTime";

function TrendArrow({ trend }: { trend: Trend }) {
  const Icon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const label = trend === "up" ? "Improving" : trend === "down" ? "Slipping" : "Holding";
  return (
    <span className={`trend trend-${trend}`} title={label} aria-label={label}>
      <Icon size={14} />
    </span>
  );
}

function TopicJournalSection({ topicId }: { topicId: string }) {
  const [entries, setEntries] = useState<TopicJournalEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  useEffect(() => {
    let alive = true;
    void getTopicJournal(topicId).then((rows) => {
      if (alive) { setEntries(rows); setLoaded(true); }
    });
    return () => { alive = false; };
  }, [topicId]);

  // Group entries by calendar date (newest date first, entries within a day newest first)
  const grouped = useMemo(() => {
    const map = new Map<string, TopicJournalEntry[]>();
    for (const entry of entries) {
      const key = formatDate(parseISO(entry.created_at), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(entry);
    }
    return [...map.entries()].map(([dateKey, dayEntries]) => ({ dateKey, dayEntries }));
  }, [entries]);

  function dateLabel(dateKey: string) {
    const d = parseISO(dateKey);
    if (isToday(d)) return "Today";
    if (isYesterday(d)) return "Yesterday";
    if (isThisWeek(d, { weekStartsOn: 1 })) return formatDate(d, "EEEE");
    return formatDate(d, "MMMM d, yyyy");
  }

  async function addEntry() {
    const entry = await addTopicJournalEntry({ topicId, body: draft });
    if (entry) { setEntries((prev) => [entry, ...prev]); setDraft(""); }
  }

  async function saveEdit(entryId: string) {
    const trimmed = editingText.trim();
    if (!trimmed) return;
    await updateTopicJournalEntry(entryId, trimmed);
    setEntries((prev) => prev.map((e) => e.id === entryId ? { ...e, body: trimmed, updated_at: new Date().toISOString() } : e));
    setEditingId(null);
  }

  async function removeEntry(entryId: string) {
    await deleteTopicJournalEntry(entryId);
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
  }

  return (
    <div className="card">
      <div className="tj-section-head">
        <Feather size={17} />
        <h2>Journal</h2>
        {entries.length > 0 ? <span className="tj-badge">{entries.length}</span> : null}
      </div>

      {/* New-entry zone — feels like opening a blank page */}
      <div className="tj-new-entry">
        <div className="tj-new-entry-header">
          <span className="tj-new-entry-label">New entry</span>
          <span className="tj-new-entry-date-label">{formatDate(new Date(), "MMMM d, yyyy")}</span>
        </div>
        <textarea
          className="tj-naked-area"
          placeholder="Capture a reflection, insight, or note about this topic…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void addEntry(); }
          }}
        />
        {draft.trim() ? (
          <div className="tj-new-entry-footer">
            <button className="btn primary small" type="button" onClick={() => void addEntry()}>Save entry</button>
            <button className="btn small ghost" type="button" onClick={() => setDraft("")}>Clear</button>
            <span className="muted" style={{ fontSize: "var(--text-xs)", marginLeft: "auto" }}>Cmd+Enter</span>
          </div>
        ) : null}
      </div>

      {/* Past entries grouped by date */}
      {loaded && entries.length === 0 ? (
        <p className="tj-empty">Your journal is empty — write your first entry above.</p>
      ) : (
        <div className="tj-journal-feed">
          {grouped.map(({ dateKey, dayEntries }) => (
            <div key={dateKey} className="tj-day-group">
              <div className="tj-day-divider"><span>{dateLabel(dateKey)}</span></div>
              {dayEntries.map((entry) => (
                <div key={entry.id} className="tj-journal-entry">
                  {editingId === entry.id ? (
                    <div className="tj-edit-form">
                      <textarea
                        className="textarea"
                        value={editingText}
                        autoFocus
                        onChange={(e) => setEditingText(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void saveEdit(entry.id); }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <div className="button-row">
                        <button className="btn small" type="button" onClick={() => void saveEdit(entry.id)}><Check size={14} /> Save</button>
                        <button className="btn small ghost" type="button" onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="tj-journal-body">{entry.body}</p>
                      <div className="tj-journal-meta">
                        <span className="tj-journal-time" title={formatDate(parseISO(entry.created_at), "MMM d, yyyy 'at' h:mm a")}>
                          {formatDate(parseISO(entry.created_at), "h:mm a")}
                          {entry.updated_at !== entry.created_at ? " · edited" : ""}
                        </span>
                        {entry.question_preview ? (
                          <span className="tj-q-chip" title={entry.question_preview}>
                            <Quote size={10} aria-hidden="true" /> {entry.question_preview}
                          </span>
                        ) : null}
                        <span className="tj-entry-actions">
                          <button className="tj-icon-btn" type="button" aria-label="Edit entry" onClick={() => { setEditingId(entry.id); setEditingText(entry.body); }}>
                            <Pencil size={13} />
                          </button>
                          <button className="tj-icon-btn danger" type="button" aria-label="Delete entry" onClick={() => void removeEntry(entry.id)}>
                            <Trash2 size={13} />
                          </button>
                        </span>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TopicsPage() {
  const store = useAppStore();
  const navigate = useNavigate();
  const { topics, sessions, questions, revisions } = store;
  const [editingId, setEditingId] = useState("");
  const [draftTitle, setDraftTitle] = useState("");

  function startRename(topicId: string, title: string) {
    setEditingId(topicId);
    setDraftTitle(title);
  }

  async function saveTitle(topic: Topic) {
    const next = draftTitle.trim();
    if (!next) {
      toast.warning("Topic name cannot be empty.");
      return;
    }
    if (next === topic.title) {
      setEditingId("");
      return;
    }
    await store.updateTopic({ id: topic.id, title: next, description: topic.description, status: topic.status, mastery_score: topic.mastery_score });
    setEditingId("");
    toast.success("Topic renamed.");
  }

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

  async function toggleSpacedRepetition(topic: Topic, enabled: boolean) {
    await store.setTopicSpacedRepetition(topic.id, enabled);
    toast.success(enabled ? `Spaced repetition on for "${topic.title}" — first review tomorrow.` : `Spaced repetition off for "${topic.title}".`);
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
          // "Spaced repetition on" == the topic has a live topic-review ladder. Old
          // topics added through Materials start with none, so the toggle is how you
          // pull them into the review track without a focus session.
          const srEnabled = revisions.some((revision) => revision.topic_id === topic.id && revision.type === "topic_review" && revision.status === "pending");
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
                <div className="button-row">
                  <button
                    className="btn icon"
                    aria-label={`Rename ${topic.title}`}
                    onClick={(event) => { event.stopPropagation(); startRename(topic.id, topic.title); }}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="btn danger icon"
                    aria-label={`Delete ${topic.title}`}
                    onClick={(event) => { event.stopPropagation(); void deleteTopic(topic.id, topic.title); }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              {editingId === topic.id ? (
                <div className="button-row" style={{ margin: "8px 0 0 0" }} onClick={(event) => event.stopPropagation()}>
                  <input
                    className="input"
                    value={draftTitle}
                    autoFocus
                    aria-label="Topic name"
                    onChange={(event) => setDraftTitle(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === "Enter") void saveTitle(topic);
                      if (event.key === "Escape") setEditingId("");
                    }}
                  />
                  <button className="btn primary" onClick={(event) => { event.stopPropagation(); void saveTitle(topic); }}>Save</button>
                  <button className="btn" onClick={(event) => { event.stopPropagation(); setEditingId(""); }}>Cancel</button>
                </div>
              ) : (
                <h2 style={{ margin: "8px 0 0 0", display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="truncate">{topic.title}</span>
                  {trend ? <TrendArrow trend={trend} /> : null}
                </h2>
              )}
              <p className="muted">{topic.description || "No description yet."}</p>
              <div className="progress"><span style={{ width: `${topic.mastery_score}%` }} /></div>
              <div className="split muted" style={{ fontSize: "var(--text-sm)" }}>
                <span>{topicSessions.length} sessions</span>
                <span>{topicQuestions.length} questions</span>
                <span>{pending} due</span>
              </div>
              <label
                className="toggle"
                style={{ fontSize: "var(--text-sm)", marginTop: 4 }}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={srEnabled}
                  onChange={(event) => { event.stopPropagation(); void toggleSpacedRepetition(topic, event.target.checked); }}
                />
                <span>Spaced repetition</span>
              </label>
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
  const getTopicAttempts = useAppStore((state) => state.getTopicAttempts);
  const [attempts, setAttempts] = useState<ReviewAttempt[]>([]);

  useEffect(() => {
    if (!topicId) {
      setAttempts([]);
      return;
    }
    let alive = true;
    void getTopicAttempts(topicId).then((rows) => {
      if (alive) setAttempts(rows);
    });
    return () => {
      alive = false;
    };
  }, [topicId, getTopicAttempts, questions]);

  const topic = topics.find((item) => item.id === topicId);

  if (!topic) return (
    <>
      <Link to="/topics" className="breadcrumb"><ChevronLeft size={14} /> Topics</Link>
      <EmptyState>Topic not found.</EmptyState>
    </>
  );

  const topicSessions = sessions.filter((session) => session.topic_id === topic.id);
  const totalMinutes = topicSessions.reduce((sum, session) => sum + sessionFocusMinutes(session), 0);
  const topicSheets = cheatsheets.filter((item) => item.topic_id === topic.id);
  const topicSets = questionSets.filter((item) => item.topic_id === topic.id);
  const topicQuestions = questions.filter((item) => item.topic_id === topic.id);
  const topicRevisions = revisions.filter((item) => item.topic_id === topic.id);
  const topicLinks = links.filter((item) => item.topic_id === topic.id);
  const practice = topicPracticeStats(attempts);

  return (
    <>
      <Link to="/topics" className="breadcrumb"><ChevronLeft size={14} /> Topics</Link>
      <PageHeader title={topic.title} eyebrow={`${topic.category_name} · ${topic.status}`} />
      <section className="grid three">
        <div className="card stat"><span className="muted">Mastery</span><strong>{topic.mastery_score}%</strong></div>
        <div className="card stat"><span className="muted">Focused time</span><strong>{formatMinutes(totalMinutes)}</strong></div>
        <div className="card stat"><span className="muted">Next revision</span><strong>{topic.next_revision_at ? formatDistanceToNow(parseISO(topic.next_revision_at), { addSuffix: true }) : "None"}</strong></div>
      </section>
      <section className="grid four" style={{ marginTop: 20 }}>
        <div className="card stat"><span className="muted">Practiced time</span><strong>{formatMinutes(practice.minutes)}</strong></div>
        <div className="card stat"><span className="muted">Cards reviewed</span><strong>{practice.cards}</strong></div>
        <div className="card stat"><span className="muted">Recall accuracy</span><strong>{practice.accuracy === null ? "—" : `${practice.accuracy}%`}</strong></div>
        <div className="card stat"><span className="muted">Last practiced</span><strong>{practice.lastPracticedAt ? formatDistanceToNow(parseISO(practice.lastPracticedAt), { addSuffix: true }) : "Never"}</strong></div>
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
      <section style={{ marginTop: 20 }}>
        <div className="card grid">
          <h2>Performance</h2>
          <p className="muted" style={{ margin: 0 }}>Each cell is one practice attempt, oldest → newest, colored by how you rated recall. Click a cell to see that attempt.</p>
          <QuestionScoreHeatmap key={topic.id} questions={topicQuestions} attempts={attempts} />
        </div>
      </section>
      <section style={{ marginTop: 20 }}>
        <TopicJournalSection topicId={topic.id} />
      </section>
    </>
  );
}
