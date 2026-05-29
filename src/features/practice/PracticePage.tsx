import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, BookmarkCheck, Sparkles } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { RatingButtons } from "../../components/ui/RatingButtons";
import { RichText } from "../../components/ui/RichText";
import { AiEvalCard } from "../../components/ui/AiEvalCard";
import { getPracticeShortcutsEnabled, getAiEvalConfig, getActiveExamDate } from "../../services/preferencesService";
import { isQuestionDue } from "../../services/spacedRepetition";
import { evaluateAnswer, recallGradeToRating, type EvaluationResult } from "../../services/aiEvaluationService";
import { useAppStore } from "../../store/appStore";
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

  const current = pool[index % Math.max(pool.length, 1)];

  // Reset transient state when the active question changes (e.g., mode switch,
  // topic switch, pool changes). Without this, the stale "revealed" / answer
  // text would persist into the next question.
  const currentId = current?.id;
  useEffect(() => {
    setRevealed(false);
    setAnswer("");
    setStartedAt(Date.now());
    setEvalState({ status: "idle" });
  }, [currentId]);

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
    await store.recordReview({ question: current, rating, userAnswer: answer, seconds: Math.round((Date.now() - startedAt) / 1000) });
    setIndex((value) => value + 1);
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
                <span className="muted">{(index % pool.length) + 1} / {pool.length}</span>
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
        ) : <EmptyState>No questions are ready for this mode. Import a Q&A set or choose another practice mode.</EmptyState>}
      </section>
    </>
  );
}
