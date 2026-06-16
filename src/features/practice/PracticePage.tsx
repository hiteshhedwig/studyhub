import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bookmark, BookmarkCheck, Check, CheckCircle2, ChevronDown, Feather, Lock, NotebookPen, Pencil, Quote, Sparkles, Timer, Trash2, X } from "lucide-react";
import { format as formatDate, formatDistanceToNow, parseISO } from "date-fns";
import { PageHeader } from "../../components/ui/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { RatingButtons } from "../../components/ui/RatingButtons";
import { RichText } from "../../components/ui/RichText";
import { AiEvalCard } from "../../components/ui/AiEvalCard";
import { CodeEditor } from "../../components/ui/CodeEditor";
import { getPracticeShortcutsEnabled, getAiEvalConfig, getActiveExamDate } from "../../services/preferencesService";
import { getAutocompleteEnabled, setAutocompleteEnabled, getTorchApiSpec } from "../../services/codeInterpreterPrefs";
import { getTorchMockPython } from "../../services/torchMock";
import { runCode as runPyCode, warmUpCodeRunner, type RunResult, type ShapeTraceLine } from "../../services/codeRunner";
import type { CodeMeta } from "../../db/repositories/types";
import { aggregateReviewRating, buildTopicReviewSet, isQuestionDue } from "../../services/spacedRepetition";
import { evaluateAnswer, evaluateCode, recallGradeToRating, type EvaluationResult } from "../../services/aiEvaluationService";
import { useAppStore } from "../../store/appStore";
import { addQuestionNote, addTopicJournalEntry, deleteQuestionNote, getQuestionNotes, getTopicJournal, updateQuestionNote } from "../../db/repositories/studyRepository";
import type { Question, QuestionNoteWithLock, ReviewRating, TopicJournalEntry } from "../../db/repositories/types";
import { toast } from "../../store/uiStore";

// Compact clock for the live practice pill: "3:45", or "1h 05m" past an hour.
function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

type Mode = "due" | "topic" | "weak" | "random" | "bookmarked" | "code";
type TopicOrder = "original" | "shuffled";

const MODE_LABELS: Record<Mode, string> = {
  due: "Due",
  topic: "Topic",
  weak: "Weak",
  random: "Random",
  bookmarked: "Bookmarked",
  code: "Coding"
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

function TopicJournalPanel({ topicId, topicTitle, question }: { topicId: string; topicTitle: string; question: Question }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<TopicJournalEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    let alive = true;
    void getTopicJournal(topicId).then((rows) => {
      if (alive) { setEntries(rows); setLoaded(true); }
    });
    return () => { alive = false; };
  }, [open, loaded, topicId]);

  function insertQA() {
    const block = `Q: ${question.question}\n\nA: ${question.answer}\n\n`;
    setDraft((prev) => prev ? block + prev : block);
  }

  async function saveEntry() {
    const entry = await addTopicJournalEntry({ topicId, body: draft, questionId: question.id });
    if (entry) {
      setEntries((prev) => [entry, ...prev]);
      setDraft("");
      setAdding(false);
      toast.success("Journal entry saved.");
    }
  }

  const recent = entries.slice(0, 3);

  return (
    <div className="tj">
      <button className="tj-header" type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Feather size={15} aria-hidden="true" />
        <span>Topic journal · {topicTitle}</span>
        {loaded && entries.length > 0 ? <span className="tj-badge">{entries.length}</span> : null}
        <ChevronDown size={15} className={`tj-chevron${open ? " open" : ""}`} aria-hidden="true" style={{ marginLeft: "auto" }} />
      </button>
      {open && (
        <div className="tj-body-reveal">
          {loaded && recent.length > 0 && (
            <div className="tj-feed">
              {recent.map((entry) => (
                <div key={entry.id} className="tj-entry">
                  <RichText className="tj-entry-body">{entry.body}</RichText>
                  <div className="tj-entry-meta">
                    <span className="tj-entry-time" title={formatDate(parseISO(entry.created_at), "MMM d, yyyy 'at' HH:mm")}>
                      {formatDistanceToNow(parseISO(entry.created_at), { addSuffix: true })}
                    </span>
                    {entry.question_preview ? (
                      <span className="tj-q-chip" title={entry.question_preview}>
                        <Quote size={10} aria-hidden="true" /> {entry.question_preview}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
              {entries.length > 3 ? (
                <p className="tj-more">+{entries.length - 3} more — view all in the topic's Journal section</p>
              ) : null}
            </div>
          )}
          {adding ? (
            <div className="tj-add-form">
              <div className="tj-add-toolbar">
                <button className="btn small" type="button" onClick={insertQA}>
                  <Quote size={14} aria-hidden="true" /> Insert Q&amp;A
                </button>
                <span className="muted" style={{ fontSize: "var(--text-xs)" }}>Cmd+Enter to save · Esc to cancel</span>
              </div>
              <textarea
                className="textarea"
                placeholder="What clicked? What do you want to explore further?"
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void saveEntry(); }
                  if (e.key === "Escape") { e.preventDefault(); setAdding(false); setDraft(""); }
                }}
              />
              <div className="tj-add-form-actions">
                <button className="btn small primary" type="button" disabled={!draft.trim()} onClick={() => void saveEntry()}>Save entry</button>
                <button className="btn small ghost" type="button" onClick={() => { setAdding(false); setDraft(""); }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="btn small" type="button" onClick={() => setAdding(true)} style={{ justifySelf: "start" }}>
              <Pencil size={14} aria-hidden="true" /> Add journal entry
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ShapeTracePanel({ trace, label = "Shape trace" }: { trace: ShapeTraceLine[]; label?: string }) {
  return (
    <div className="shape-trace">
      <div className="shape-trace-header">{label}</div>
      <table className="shape-trace-table">
        <tbody>
          {trace.map((entry) =>
            Object.entries(entry.vars).map(([name, v]) => (
              <tr key={`${entry.line}-${name}`} className={`shape-row shape-row--${v.status}`}>
                <td className="shape-line">line {entry.line}</td>
                <td className="shape-name">{name}</td>
                <td className="shape-val">({v.shape.join(", ")})</td>
                <td className="shape-dtype">{v.dtype}</td>
                <td className="shape-status">
                  {v.status === "changed" && v.from ? (
                    <span className="shape-from">← was ({v.from.join(", ")})</span>
                  ) : (
                    <span className="shape-new">new</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
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
  const [codeEvalState, setCodeEvalState] = useState<{ status: "idle" | "loading" | "done" | "error"; result?: EvaluationResult; error?: string }>({ status: "idle" });
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

  // Live practice timer + run tally (this page-visit). Active time only — pauses
  // when the tab is hidden or after a minute of no input, so it stays honest.
  const [activeSeconds, setActiveSeconds] = useState(0);
  const [cardsThisRun, setCardsThisRun] = useState(0);
  const [topicCount, setTopicCount] = useState(0);

  // Code interpreter state
  const [userCode, setUserCode] = useState("");
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [pyodideReady, setPyodideReady] = useState(false);
  const [solutionRunResult, setSolutionRunResult] = useState<RunResult | null>(null);
  const [solutionRunning, setSolutionRunning] = useState(false);
  const [autocomplete, setAutocomplete] = useState(() => getAutocompleteEnabled());
  const topicsRef = useRef<Set<string>>(new Set());
  // Mirror `revealed` into a ref so the 1s timer tick reads it without re-subscribing.
  const revealedRef = useRef(false);
  revealedRef.current = revealed;
  // When the current card was revealed — recall time is start→reveal, so the
  // recorded per-card time (heatmap + topic stats) excludes answer-study time too.
  const revealedAtRef = useRef<number | null>(null);

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
    setReviewPool(buildTopicReviewSet(snapshot, reviewTopicId, getActiveExamDate()).filter((q) => q.code_meta_json === null));
    setReviewRatings([]);
    setIndex(0);
  }, [reviewTopicId, reviewId]);

  const pool = useMemo(() => {
    const isRecall = (q: { code_meta_json: string | null }) => q.code_meta_json === null;
    if (mode === "due") {
      // Due = never reviewed, scheduled for today/earlier, or pulled in by exam mode
      // as the target date nears. Always shuffled so the queue isn't a fixed order.
      const examDate = getActiveExamDate();
      const list = store.questions.filter((question) => isRecall(question) && isQuestionDue(question, examDate));
      return shuffleWithSeed(list, shuffleSeed);
    }
    if (mode === "topic") {
      const list = store.questions.filter((question) => isRecall(question) && (!topicId || question.topic_id === topicId));
      return topicOrder === "shuffled" ? shuffleWithSeed(list, shuffleSeed) : list;
    }
    if (mode === "weak") {
      return store.questions.filter((question) => isRecall(question) && (question.mastery_score < 45 || question.difficulty === "hard"));
    }
    if (mode === "bookmarked") {
      return store.questions.filter((question) => isRecall(question) && Boolean(question.bookmarked));
    }
    if (mode === "code") {
      const list = store.questions.filter((question) => question.code_meta_json !== null && (!topicId || question.topic_id === topicId));
      return topicOrder === "shuffled" ? shuffleWithSeed(list, shuffleSeed) : list;
    }
    // Random — recall only
    return shuffleWithSeed(store.questions.filter(isRecall), shuffleSeed);
  }, [store.questions, mode, topicId, topicOrder, shuffleSeed]);

  // In a review the queue is finite and ordered (no modulo) so it can run out
  // and surface the completion panel; normal modes loop with modulo.
  const current = reviewActive ? reviewPool[index] : pool[index % Math.max(pool.length, 1)];

  // Reset transient state when the active question changes (e.g., mode switch,
  // topic switch, pool changes). Without this, the stale "revealed" / answer
  // text would persist into the next question.
  const currentId = current?.id;

  const codeMeta = useMemo<CodeMeta | null>(() => {
    if (!current?.code_meta_json) return null;
    try { return JSON.parse(current.code_meta_json) as CodeMeta; } catch { return null; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, current?.code_meta_json]);

  useEffect(() => {
    setRevealed(false);
    setAnswer("");
    setStartedAt(Date.now());
    revealedAtRef.current = null;
    setEvalState({ status: "idle" });
    setNotes([]);
    setDraft("");
    setEditingId(null);
    setRunResult(null);
    setRunning(false);
    setSolutionRunResult(null);
    setSolutionRunning(false);
    setCodeEvalState({ status: "idle" });
  }, [currentId]);

  // Reset code editor to starter code whenever the question changes
  useEffect(() => {
    setUserCode(codeMeta?.starter_code ?? "");
  }, [codeMeta]);

  // Stamp the recall→reveal moment once, the first time this card is revealed.
  useEffect(() => {
    if (revealed && revealedAtRef.current === null) revealedAtRef.current = Date.now();
  }, [revealed]);

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

  async function handleCodeRun() {
    if (!current || !codeMeta) return;
    setRunning(true);
    try {
      const spec = getTorchApiSpec();
      const torchMockCode = spec ? getTorchMockPython(spec) : "";
      const isTorch = codeMeta.framework === "torch" || userCode.includes("import torch") || userCode.includes("from torch");
      // Torch questions: inject mock and run for syntax checking, but skip test assertions
      // since the mock can't produce values that match expected_value/expected_shape checks.
      const result = await runPyCode({ code: userCode, testCases: isTorch ? [] : codeMeta.test_cases, torchMockCode });
      setPyodideReady(true);
      setRunResult(result);
    } catch (e: unknown) {
      setRunResult({ stdout: "", stderr: "", error: e instanceof Error ? e.message : String(e), testResults: [], shapeTrace: [] });
    } finally {
      setRunning(false);
    }
  }

  async function handleSolutionRun() {
    if (!current || !codeMeta) return;
    setSolutionRunning(true);
    try {
      const spec = getTorchApiSpec();
      const torchMockCode = spec ? getTorchMockPython(spec) : "";
      const solutionCode = current.answer;
      const isTorch = codeMeta.framework === "torch" || solutionCode.includes("import torch") || solutionCode.includes("from torch");
      const result = await runPyCode({ code: solutionCode, testCases: isTorch ? [] : codeMeta.test_cases, torchMockCode });
      setSolutionRunResult(result);
    } catch (e: unknown) {
      setSolutionRunResult({ stdout: "", stderr: "", error: e instanceof Error ? e.message : String(e), testResults: [], shapeTrace: [] });
    } finally {
      setSolutionRunning(false);
    }
  }

  async function runCodeEval() {
    if (!current || !codeMeta) return;
    setCodeEvalState({ status: "loading" });
    const result = await evaluateCode({
      question: current.question,
      solution: current.answer,
      userCode,
      testResults: runResult?.testResults ?? [],
      runError: runResult?.error ?? null,
      stdout: runResult?.stdout ?? ""
    });
    setCodeEvalState(result.ok ? { status: "done", result: result.data } : { status: "error", error: result.error });
  }

  function toggleAutocomplete() {
    setAutocomplete((prev) => {
      setAutocompleteEnabled(!prev);
      return !prev;
    });
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
    const recallEnd = revealedAtRef.current ?? Date.now();
    await store.recordReview({ question: current, rating, userAnswer: answer, seconds: Math.round((recallEnd - startedAt) / 1000) });
    setCardsThisRun((value) => value + 1);
    if (!topicsRef.current.has(current.topic_id)) {
      topicsRef.current.add(current.topic_id);
      setTopicCount(topicsRef.current.size);
    }
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
        if (codeMeta) { skipForward(); return; }
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

  // Live practice timer: counts the recall phase only. It pauses the moment you
  // reveal the answer — so the time you spend understanding and correcting your
  // mistake is "free" — and resumes when the next card flips back to the question.
  // (Also pauses while the tab is hidden.)
  useEffect(() => {
    const tick = window.setInterval(() => {
      if (document.hidden || revealedRef.current) return;
      setActiveSeconds((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(tick);
  }, []);

  // Pre-warm Pyodide in the background as soon as the user has any code questions,
  // so the ~15 MB download happens silently rather than blocking the first Run click.
  useEffect(() => {
    if (store.questions.some((q) => q.code_meta_json !== null)) {
      warmUpCodeRunner();
      // Mark ready once the warmup response comes back (worker responds to __warmup__ id,
      // which pending ignores, so we wait a generous delay instead).
      const t = setTimeout(() => setPyodideReady(true), 20_000);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHeader title="Practice" eyebrow="Active recall first, answer second, rating last." />
      {cardsThisRun > 0 || activeSeconds > 0 ? (
        <div className="practice-timer" aria-live="polite">
          <Timer size={14} aria-hidden="true" />
          <span className="practice-timer-clock">{formatClock(activeSeconds)}</span>
          <span className="muted">·</span>
          <span>{cardsThisRun} card{cardsThisRun === 1 ? "" : "s"}</span>
          {topicCount > 1 ? <><span className="muted">·</span><span>{topicCount} topics</span></> : null}
        </div>
      ) : null}
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
        {(mode === "topic" || mode === "code") ? (
          <>
            <select className="select" style={{ maxWidth: 260 }} value={topicId} onChange={(event) => { setTopicId(event.target.value); setIndex(0); setShuffleSeed(Date.now()); }}>
              <option value="">{mode === "code" ? "All coding topics" : "All topics"}</option>
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
          codeMeta ? (
            /* ---- Code question branch ---- */
            <div className="grid">
              <div className="split">
                <span className="pill">{current.topic_title} · {current.difficulty} · python</span>
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
              {(codeMeta?.framework === "torch" || userCode.includes("import torch") || userCode.includes("from torch")) ? (
                <div className="torch-warning">⚠ torch is mocked — run checks syntax only, no test assertions</div>
              ) : null}
              {!revealed ? (
                <>
                  <CodeEditor value={userCode} onChange={setUserCode} autoComplete={autocomplete} minHeight={300} />
                  <div className="code-toolbar">
                    <button className="btn primary" type="button" onClick={() => void handleCodeRun()} disabled={running}>
                      {running ? (pyodideReady ? "Running…" : "Loading Python runtime…") : "▶ Run code"}
                    </button>
                    <button className="btn small" type="button" onClick={toggleAutocomplete} title="Toggle editor autocomplete">
                      Autocomplete {autocomplete ? "on" : "off"}
                    </button>
                    {runResult ? (
                      <button className="btn" type="button" onClick={() => setRevealed(true)}>Reveal solution</button>
                    ) : null}
                    <button className="btn" type="button" onClick={skipForward} style={{ marginLeft: "auto" }}>Skip</button>
                  </div>
                  {runResult ? (
                    <div className="code-output-wrap">
                      {runResult.error ? (
                        <pre className="code-output error">{runResult.error}</pre>
                      ) : runResult.stdout ? (
                        <pre className="code-output">{runResult.stdout}</pre>
                      ) : (
                        <pre className="code-output muted">No output</pre>
                      )}
                      {(codeMeta?.framework === "torch" || userCode.includes("import torch") || userCode.includes("from torch")) && !runResult.error ? (
                        <div className="torch-syntax-note">Syntax OK — test assertions skipped (torch is mocked, real execution not available)</div>
                      ) : runResult.testResults.length > 0 ? (
                        <div className="test-results">
                          {runResult.testResults.map((tr, i) => (
                            <div key={i} className={`test-row ${tr.passed ? "pass" : "fail"}`}>
                              <span className="test-badge">{tr.passed ? "✓" : "✗"}</span>
                              <span className="test-desc">{tr.description}</span>
                              {!tr.passed && (tr.actual ?? tr.error) ? (
                                <span className="test-actual">{tr.error ?? `got: ${tr.actual ?? ""}`}</span>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {runResult.shapeTrace.length > 0 ? (
                        <ShapeTracePanel trace={runResult.shapeTrace} />
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="code-compare">
                    <div className="code-compare-pane">
                      <h3 className="code-compare-label">Your attempt</h3>
                      <CodeEditor value={userCode} readOnly minHeight={220} />
                      {runResult?.shapeTrace && runResult.shapeTrace.length > 0 ? (
                        <ShapeTracePanel trace={runResult.shapeTrace} label="Your shapes" />
                      ) : null}
                    </div>
                    <div className="code-compare-pane">
                      <div className="code-compare-label-row">
                        <h3 className="code-compare-label">Solution</h3>
                        {codeMeta ? (
                          <button className="btn small" type="button" onClick={() => void handleSolutionRun()} disabled={solutionRunning}>
                            {solutionRunning ? "Running…" : "▶ Run solution"}
                          </button>
                        ) : null}
                      </div>
                      <CodeEditor value={current.answer} readOnly minHeight={220} />
                      {solutionRunResult ? (
                        solutionRunResult.error ? (
                          <pre className="code-output error" style={{ marginTop: 8 }}>{solutionRunResult.error}</pre>
                        ) : solutionRunResult.shapeTrace.length > 0 ? (
                          <ShapeTracePanel trace={solutionRunResult.shapeTrace} label="Solution shapes" />
                        ) : (
                          <p className="muted" style={{ fontSize: "var(--text-sm)", marginTop: 8 }}>No array shapes captured.</p>
                        )
                      ) : null}
                    </div>
                  </div>
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
                                <textarea className="textarea" value={editingText} autoFocus onChange={(event) => setEditingText(event.target.value)}
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
                                  <span className="muted" title={formatDate(parseISO(note.created_at), "MMM d, yyyy · HH:mm")}>{formatDistanceToNow(parseISO(note.created_at), { addSuffix: true })}</span>
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
                      <textarea className="textarea"
                        placeholder={notes.length ? "Add today's note — what did you get wrong vs. last time?" : "What tripped you up? (seals when you rate)"}
                        value={draft} onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void saveDraft(); } }}
                      />
                      <button className="btn small" type="button" disabled={!draft.trim()} onClick={() => void saveDraft()}>Save note</button>
                    </div>
                  </div>
                  <TopicJournalPanel key={currentId} topicId={current.topic_id} topicTitle={current.topic_title ?? ""} question={current} />
                  {aiAvailable && codeEvalState.status === "idle" ? (
                    <button className="btn" type="button" onClick={() => void runCodeEval()} style={{ justifySelf: "start" }}>
                      <Sparkles size={16} />AI code review
                    </button>
                  ) : null}
                  {codeEvalState.status === "loading" ? (
                    <div className="ai-eval-status"><span className="ai-spinner" aria-hidden="true" /> Reviewing your code…</div>
                  ) : null}
                  {codeEvalState.status === "error" ? (
                    <div className="ai-eval-status error">
                      <span>AI review failed: {codeEvalState.error}</span>
                      <button className="btn small" type="button" onClick={() => void runCodeEval()}>Retry</button>
                    </div>
                  ) : null}
                  {codeEvalState.status === "done" && codeEvalState.result ? <AiEvalCard result={codeEvalState.result} /> : null}
                  <RatingButtons onRate={rate} suggested={codeEvalState.status === "done" && codeEvalState.result ? recallGradeToRating(codeEvalState.result.recall_grade) : undefined} />
                </>
              )}
            </div>
          ) : (
            /* ---- Recall question branch (unchanged) ---- */
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
                  <TopicJournalPanel key={currentId} topicId={current.topic_id} topicTitle={current.topic_title ?? ""} question={current} />
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
          )
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
