import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bookmark, BookmarkCheck, Check, CheckCircle2, Lock, NotebookPen, Pencil, Sparkles, Trash2, X } from "lucide-react";
import { format as formatDate, formatDistanceToNow, parseISO } from "date-fns";
import { PageHeader } from "../../components/ui/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { RatingButtons } from "../../components/ui/RatingButtons";
import { RichText } from "../../components/ui/RichText";
import { AiEvalCard } from "../../components/ui/AiEvalCard";
import { getPracticeShortcutsEnabled, getAiEvalConfig, getActiveExamDate } from "../../services/preferencesService";
import { aggregateReviewRating, buildTopicReviewSet, isQuestionDue } from "../../services/spacedRepetition";
import { evaluateAnswer, recallGradeToRating, type EvaluationResult } from "../../services/aiEvaluationService";
import { useAppStore } from "../../store/appStore";
import { addQuestionNote, deleteQuestionNote, getQuestionNotes, updateQuestionNote } from "../../db/repositories/studyRepository";
import type { Question, QuestionNoteWithLock, ReviewRating } from "../../db/repositories/types";
import { toast } from "../../store/uiStore";

type Mode = "due" | "topic" | "weak" | "random" | "bookmarked";
type TopicOrder = "original" | "shuffled";

const MODE_LABELS: Record<Mode, string> = {
  due: "Due",
  topic: "Topic",
  weak: "Weak",
  random: "Random",
  bookmarked: "Bookmarked"
};

function shuffleWithSeed<T>(items: T[], seed: number): T[] {
  // Mulberry32 PRNG — deterministic shuffle so reveal/rate doesn't reshuffle.
  let state = seed || 1;
  const rng = () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function PracticePage() {
  const store = useAppStore();
  const [mode, setMode] = useState<Mode>("due");
  const [topicId, setTopicId] = useState("");
  const [topicOrder, setTopicOrder] = useState<TopicOrder>("original");
  const [shuffleSeed, setShuffleSeed] = useState(() => Date.now());
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [answer, setAnswer] = useState("");
  const [startedAt, setStartedAt] = useState(Date.now());
  const [shortcutsEnabled] = useState(() => getPracticeShortcutsEnabled());
  const [aiConfig] = useState(() => getAiEvalConfig());
  const [evalState, setEvalState] = useState<{ status: "idle" | "loading" | "done" | "error"; result?: EvaluationResult; error?: string }>({ status: "idle" });
  const answerRef = useRef<HTMLTextAreaElement | null>(null);
  const aiAvailable = aiConfig.enabled && Boolean(aiConfig.apiKey);

  // Per-question "notes to self": prior-encounter notes (read-only) plus the
  // draft you're writing now, which seals into history the moment you rate.
  const [notes, setNotes] = useState<QuestionNoteWithLock[]>([]);
  const [draft, setDraft] = useState("");
  const draftRef = useRef("");
  draftRef.current = draft;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  // Topic-review entry: /practice?topic=<id>&review=<revisionId>. A review is a
  // frozen, recall-first set for one topic that, when finished, closes the due
  // topic review. The set is snapshotted on entry so rating a card doesn't
  // reshuffle or shrink the queue mid-session.
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const reviewTopicId = params.get("topic");
  const reviewId = params.get("review");
  const reviewActive = Boolean(reviewTopicId);
  const [reviewPool, setReviewPool] = useState<Question[]>([]);
  const [reviewRatings, setReviewRatings] = useState<ReviewRating[]>([]);
  const reviewTopicTitle = store.topics.find((topic) => topic.id === reviewTopicId)?.title ?? "Topic";

  useEffect(() => {
    if (!reviewTopicId) {
      setReviewPool([]);
      setReviewRatings([]);
      return;
    }
    const snapshot = useAppStore.getState().questions;
    setReviewPool(buildTopicReviewSet(snapshot, reviewTopicId, getActiveExamDate()));
    setReviewRatings([]);
    setIndex(0);
  }, [reviewTopicId, reviewId]);

  const pool = useMemo(() => {
    if (mode === "due") {
      // Due = never reviewed, scheduled for today/earlier, or pulled in by exam mode
      // as the target date nears. Always shuffled so the queue isn't a fixed order.
      const examDate = getActiveExamDate();
      const list = store.questions.filter((question) => isQuestionDue(question, examDate));
      return shuffleWithSeed(list, shuffleSeed);
    }
    if (mode === "topic") {
      const list = store.questions.filter((question) => !topicId || question.topic_id === topicId);
      return topicOrder === "shuffled" ? shuffleWithSeed(list, shuffleSeed) : list;
    }
    if (mode === "weak") {
      return store.questions.filter((question) => question.mastery_score < 45 || question.difficulty === "hard");
    }
    if (mode === "bookmarked") {
      return store.questions.filter((question) => question.bookmarked);
    }
    return shuffleWithSeed(store.questions, shuffleSeed);
  }, [store.questions, mode, topicId, topicOrder, shuffleSeed]);

  // In a review the queue is finite and ordered (no modulo) so it can run out
  // and surface the completion panel; normal modes loop with modulo.
  const current = reviewActive ? reviewPool[index] : pool[index % Math.max(pool.length, 1)];

  // Reset transient state when the active question changes (e.g., mode switch,
  // topic switch, pool changes). Without this, the stale "revealed" / answer
  // text would persist into the next question.
  const currentId = current?.id;
  useEffect(() => {
    setRevealed(false);
    setAnswer("");
    setStartedAt(Date.now());
    setEvalState({ status: "idle" });
    setNotes([]);
    setDraft("");
    setEditingId(null);
  }, [currentId]);

  // Load this question's notes only once the answer is revealed — showing them
  // earlier would leak hints into the recall.
  useEffect(() => {
    if (!revealed || !currentId) return;
    let cancelled = false;
    void getQuestionNotes(currentId).then((rows) => {
      if (!cancelled) setNotes(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [revealed, currentId]);

  async function runEvaluation() {
    if (!current) return;
    setRevealed(true);
    setEvalState({ status: "loading" });
    const result = await evaluateAnswer({ question: current.question, canonical: current.answer, userAnswer: answer });
    setEvalState(result.ok ? { status: "done", result: result.data } : { status: "error", error: result.error });
  }

  async function toggleBookmark() {
    if (!current) return;
    const nowBookmarked = await store.toggleBookmark(current.id);
    toast.success(nowBookmarked ? "Bookmarked" : "Removed bookmark");
  }

  async function rate(rating: "forgot" | "hard" | "good" | "easy") {
    if (!current) return;
    // Persist an unsaved draft *before* the attempt lands so it seals as history
    // with this rating attached (read via draftRef to dodge stale keyboard closures).
    const pending = draftRef.current.trim();
    if (pending) {
      await addQuestionNote({ questionId: current.id, body: pending, rating });
      setDraft("");
    }
    await store.recordReview({ question: current, rating, userAnswer: answer, seconds: Math.round((Date.now() - startedAt) / 1000) });
    if (reviewActive) setReviewRatings((previous) => [...previous, rating]);
    setIndex((value) => value + 1);
  }

  async function saveDraft() {
    if (!current || !draft.trim()) return;
    const note = await addQuestionNote({ questionId: current.id, body: draft });
    if (note) {
      setNotes((previous) => [note, ...previous]);
      setDraft("");
    }
  }

  async function saveEdit(noteId: string) {
    const result = await updateQuestionNote(noteId, editingText);
    if (result.ok) {
      const trimmed = editingText.trim();
      setNotes((previous) => previous.map((note) => (note.id === noteId ? { ...note, body: trimmed } : note)));
      setEditingId(null);
    } else {
      toast.danger("That note is locked — it sealed when you rated this question earlier.");
    }
  }

  async function removeNote(noteId: string) {
    const result = await deleteQuestionNote(noteId);
    if (result.ok) setNotes((previous) => previous.filter((note) => note.id !== noteId));
    else toast.danger("That note is locked and can't be deleted.");
  }

  // One-tap confirm after recall: closes the due topic review, logging the
  // session's worst card rating for history (topic intervals stay fixed).
  async function confirmReview() {
    if (!reviewId) return;
    await store.completeRevision(reviewId, aggregateReviewRating(reviewRatings));
    toast.success(`Marked “${reviewTopicTitle}” reviewed`);
    navigate("/revisions");
  }

  function exitReview() {
    navigate("/practice");
  }

  function skipForward() {
    if (!current) return;
    setIndex((value) => value + 1);
  }

  // Keyboard shortcuts: Space reveals, →/N skips, 1-4 rate. Can be turned off in Settings.
  useEffect(() => {
    if (!shortcutsEnabled) return;
    function isTypingInField(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      if (tag === "input" || tag === "select") return true;
      if (tag === "textarea") return true;
      if (target.isContentEditable) return true;
      return false;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // Allow typing in the answer textarea, but Space-with-shift still triggers reveal.
      const inField = isTypingInField(event.target);
      if (event.key === " " && (!inField || event.shiftKey)) {
        event.preventDefault();
        if (!current) return;
        if (!revealed) setRevealed(true);
        else skipForward();
        return;
      }
      if (inField) return;
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "n") {
        event.preventDefault();
        skipForward();
        return;
      }
      if (revealed && current) {
        if (event.key === "1") { event.preventDefault(); void rate("forgot"); }
        if (event.key === "2") { event.preventDefault(); void rate("hard"); }
        if (event.key === "3") { event.preventDefault(); void rate("good"); }
        if (event.key === "4") { event.preventDefault(); void rate("easy"); }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, revealed, shortcutsEnabled]);

  return (
    <>
      <PageHeader title="Practice" eyebrow="Active recall first, answer second, rating last." />
      {reviewActive ? (
        <div className="card split" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <span className="eyebrow">Topic review</span>
            <strong style={{ display: "block" }}>{reviewTopicTitle}</strong>
            <p className="muted" style={{ margin: 0 }}>Recall from memory first — rate each card honestly, then mark the review done.</p>
          </div>
          <div className="button-row" style={{ alignItems: "center" }}>
            <span className="muted" style={{ fontSize: "var(--text-xs)" }}>{Math.min(index, reviewPool.length)} / {reviewPool.length} recalled</span>
            <button className="btn primary" type="button" onClick={() => void confirmReview()} disabled={reviewRatings.length === 0} title={reviewRatings.length === 0 ? "Recall at least one card first" : "Mark this topic review complete"}>
              <CheckCircle2 size={16} /> Mark reviewed
            </button>
            <button className="btn" type="button" onClick={exitReview} title="Leave without completing the review"><X size={16} /> Exit</button>
          </div>
        </div>
      ) : (
      <div className="card button-row" style={{ flexWrap: "wrap" }}>
        {(Object.keys(MODE_LABELS) as Mode[]).map((item) => (
          <button
            className={`btn ${mode === item ? "primary" : ""}`}
            key={item}
            type="button"
            onClick={() => { setMode(item); setIndex(0); }}
          >
            {MODE_LABELS[item]}
          </button>
        ))}
        {mode === "topic" ? (
          <>
            <select className="select" style={{ maxWidth: 260 }} value={topicId} onChange={(event) => { setTopicId(event.target.value); setIndex(0); setShuffleSeed(Date.now()); }}>
              <option value="">All topics</option>
              {store.topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}
            </select>
            <div className="button-row" role="radiogroup" aria-label="Question order">
              <button
                type="button"
                className={`btn small ${topicOrder === "original" ? "primary" : ""}`}
                onClick={() => { setTopicOrder("original"); setIndex(0); }}
                title="Show questions in the order they were imported"
              >
                Original
              </button>
              <button
                type="button"
                className={`btn small ${topicOrder === "shuffled" ? "primary" : ""}`}
                onClick={() => { setTopicOrder("shuffled"); setIndex(0); setShuffleSeed(Date.now()); }}
                title="Random order"
              >
                Shuffled
              </button>
              {topicOrder === "shuffled" ? (
                <button type="button" className="btn small" onClick={() => { setShuffleSeed(Date.now()); setIndex(0); }} title="Reshuffle">
                  Reshuffle
                </button>
              ) : null}
            </div>
          </>
        ) : null}
        <span className="muted" style={{ marginLeft: "auto", fontSize: "var(--text-xs)" }}>
          {shortcutsEnabled ? "Space: reveal · → / N: next · 1-4: rate · ?: all shortcuts" : "Practice shortcuts off — enable in Settings"}
        </span>
      </div>
      )}
      <section className="card raised" style={{ marginTop: 20 }}>
        {current ? (
          <div className="grid">
            <div className="split">
              <span className="pill">{current.topic_title} · {current.difficulty}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <button
                  type="button"
                  className={`btn small ${current.bookmarked ? "primary" : ""}`}
                  onClick={() => void toggleBookmark()}
                  aria-pressed={Boolean(current.bookmarked)}
                  title={current.bookmarked ? "Remove bookmark" : "Bookmark this question"}
                >
                  {current.bookmarked ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
                  {current.bookmarked ? "Bookmarked" : "Bookmark"}
                </button>
                <span className="muted">{reviewActive ? index + 1 : (index % pool.length) + 1} / {reviewActive ? reviewPool.length : pool.length}</span>
              </span>
            </div>
            <RichText className="prompt">{current.question}</RichText>
            <label className="field">
              <span>Your answer</span>
              <textarea ref={answerRef} className="textarea" value={answer} onChange={(event) => setAnswer(event.target.value)} />
            </label>
            {!revealed ? (
              <div className="button-row">
                <button className="btn primary" type="button" onClick={() => setRevealed(true)}>Reveal answer</button>
                {aiAvailable ? (
                  <button className="btn" type="button" onClick={() => void runEvaluation()}><Sparkles size={16} />AI Evaluation</button>
                ) : null}
                <button className="btn" type="button" onClick={skipForward}>Skip</button>
              </div>
            ) : (
              <>
                <div className="card"><h3>Answer</h3><RichText>{current.answer}</RichText></div>
                <div className="qnote">
                  <div className="qnote-head">
                    <NotebookPen size={15} aria-hidden="true" />
                    <span>Notes to self</span>
                    {notes.length ? <span className="qnote-count">{notes.length}</span> : null}
                  </div>
                  {notes.length ? (
                    <ul className="qnote-list">
                      {notes.map((note) => (
                        <li key={note.id} className={`qnote-item${note.editable ? " editable" : ""}`}>
                          {editingId === note.id ? (
                            <div className="qnote-edit">
                              <textarea
                                className="textarea"
                                value={editingText}
                                autoFocus
                                onChange={(event) => setEditingText(event.target.value)}
                                onKeyDown={(event) => {
                                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void saveEdit(note.id); }
                                  if (event.key === "Escape") { event.preventDefault(); setEditingId(null); }
                                }}
                              />
                              <div className="qnote-actions">
                                <button className="btn small" type="button" onClick={() => void saveEdit(note.id)}><Check size={14} /> Save</button>
                                <button className="btn small ghost" type="button" onClick={() => setEditingId(null)}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <RichText className="qnote-body">{note.body}</RichText>
                              <div className="qnote-meta">
                                {note.rating ? <span className={`qnote-chip ${note.rating}`}>{note.rating}</span> : null}
                                <span className="muted" title={formatDate(parseISO(note.created_at), "MMM d, yyyy · HH:mm")}>
                                  {formatDistanceToNow(parseISO(note.created_at), { addSuffix: true })}
                                </span>
                                {note.editable ? (
                                  <span className="qnote-actions">
                                    <button className="qnote-icon" type="button" aria-label="Edit note" onClick={() => { setEditingId(note.id); setEditingText(note.body); }}><Pencil size={13} /></button>
                                    <button className="qnote-icon" type="button" aria-label="Delete note" onClick={() => void removeNote(note.id)}><Trash2 size={13} /></button>
                                  </span>
                                ) : (
                                  <span className="qnote-lock" title="Sealed — written in an earlier review"><Lock size={12} aria-hidden="true" /></span>
                                )}
                              </div>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="qnote-add">
                    <textarea
                      className="textarea"
                      placeholder={notes.length ? "Add today's note — what tripped you up vs. last time?" : "What tripped you up? (seals when you rate)"}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void saveDraft(); }
                      }}
                    />
                    <button className="btn small" type="button" disabled={!draft.trim()} onClick={() => void saveDraft()}>Save note</button>
                  </div>
                </div>
                {aiAvailable && evalState.status === "idle" ? (
                  <button className="btn" type="button" onClick={() => void runEvaluation()} style={{ justifySelf: "start" }}><Sparkles size={16} />Evaluate with AI</button>
                ) : null}
                {evalState.status === "loading" ? (
                  <div className="ai-eval-status"><span className="ai-spinner" aria-hidden="true" /> Evaluating your answer…</div>
                ) : null}
                {evalState.status === "error" ? (
                  <div className="ai-eval-status error">
                    <span>AI evaluation failed: {evalState.error}</span>
                    <button className="btn small" type="button" onClick={() => void runEvaluation()}>Retry</button>
                  </div>
                ) : null}
                {evalState.status === "done" && evalState.result ? <AiEvalCard result={evalState.result} /> : null}
                <RatingButtons onRate={rate} suggested={evalState.status === "done" && evalState.result ? recallGradeToRating(evalState.result.recall_grade) : undefined} />
              </>
            )}
          </div>
        ) : reviewActive ? (
          <div className="grid" style={{ justifyItems: "center", textAlign: "center", gap: 14, padding: "12px 0" }}>
            <CheckCircle2 size={40} style={{ color: "var(--accent)" }} aria-hidden="true" />
            <div>
              <h3 style={{ margin: 0 }}>{reviewPool.length ? "Recall complete" : "No questions in this topic yet"}</h3>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                {reviewPool.length
                  ? `You recalled ${reviewRatings.length} of ${reviewPool.length} card${reviewPool.length === 1 ? "" : "s"} for ${reviewTopicTitle}.`
                  : `There's nothing to recall for ${reviewTopicTitle}. You can still mark the review done or add questions first.`}
              </p>
            </div>
            <div className="button-row">
              <button className="btn primary" type="button" onClick={() => void confirmReview()}><CheckCircle2 size={16} /> Mark reviewed</button>
              <button className="btn" type="button" onClick={exitReview}>Exit without completing</button>
            </div>
          </div>
        ) : <EmptyState>No questions are ready for this mode. Import a Q&A set or choose another practice mode.</EmptyState>}
      </section>
    </>
  );
}
