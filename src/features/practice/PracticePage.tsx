import { useEffect, useMemo, useRef, useState } from "react";
import { isPast, isToday, parseISO } from "date-fns";
import { PageHeader } from "../../components/ui/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { RatingButtons } from "../../components/ui/RatingButtons";
import { useAppStore } from "../../store/appStore";

type Mode = "due" | "topic" | "weak" | "random";
type TopicOrder = "original" | "shuffled";

const MODE_LABELS: Record<Mode, string> = {
  due: "Due",
  topic: "Topic",
  weak: "Weak",
  random: "Random"
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
  const answerRef = useRef<HTMLTextAreaElement | null>(null);

  const pool = useMemo(() => {
    if (mode === "due") {
      return store.questions.filter((question) => isToday(parseISO(question.next_due_at)) || isPast(parseISO(question.next_due_at)));
    }
    if (mode === "topic") {
      const list = store.questions.filter((question) => !topicId || question.topic_id === topicId);
      return topicOrder === "shuffled" ? shuffleWithSeed(list, shuffleSeed) : list;
    }
    if (mode === "weak") {
      return store.questions.filter((question) => question.mastery_score < 45 || question.difficulty === "hard");
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
  }, [currentId]);

  async function rate(rating: "forgot" | "hard" | "good" | "easy") {
    if (!current) return;
    await store.recordReview({ question: current, rating, userAnswer: answer, seconds: Math.round((Date.now() - startedAt) / 1000) });
    setIndex((value) => value + 1);
  }

  function skipForward() {
    if (!current) return;
    setIndex((value) => value + 1);
  }

  // Keyboard shortcuts: Space reveals, →/N skips, 1-4 rate, ?/H shows help.
  useEffect(() => {
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
  }, [current?.id, revealed]);

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
          Space: reveal · → / N: next · 1-4: rate
        </span>
      </div>
      <section className="card raised" style={{ marginTop: 20 }}>
        {current ? (
          <div className="grid">
            <div className="split">
              <span className="pill">{current.topic_title} · {current.difficulty}</span>
              <span className="muted">{(index % pool.length) + 1} / {pool.length}</span>
            </div>
            <h2>{current.question}</h2>
            <label className="field">
              <span>Your answer</span>
              <textarea ref={answerRef} className="textarea" value={answer} onChange={(event) => setAnswer(event.target.value)} />
            </label>
            {!revealed ? (
              <div className="button-row">
                <button className="btn primary" type="button" onClick={() => setRevealed(true)}>Reveal answer</button>
                <button className="btn" type="button" onClick={skipForward}>Skip</button>
              </div>
            ) : (
              <>
                <div className="card"><h3>Answer</h3><p>{current.answer}</p></div>
                <RatingButtons onRate={rate} />
              </>
            )}
          </div>
        ) : <EmptyState>No questions are ready for this mode. Import a Q&A set or choose another practice mode.</EmptyState>}
      </section>
    </>
  );
}
