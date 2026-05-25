import { useMemo, useState } from "react";
import { isPast, isToday, parseISO } from "date-fns";
import { PageHeader } from "../../components/ui/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { RatingButtons } from "../../components/ui/RatingButtons";
import { useAppStore } from "../../store/appStore";

type Mode = "due" | "topic" | "weak" | "random";

export function PracticePage() {
  const store = useAppStore();
  const [mode, setMode] = useState<Mode>("due");
  const [topicId, setTopicId] = useState("");
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [answer, setAnswer] = useState("");
  const [startedAt, setStartedAt] = useState(Date.now());

  const pool = useMemo(() => {
    const list =
      mode === "due"
        ? store.questions.filter((question) => isToday(parseISO(question.next_due_at)) || isPast(parseISO(question.next_due_at)))
        : mode === "topic"
          ? store.questions.filter((question) => !topicId || question.topic_id === topicId)
          : mode === "weak"
            ? store.questions.filter((question) => question.mastery_score < 45 || question.difficulty === "hard")
            : [...store.questions].sort(() => Math.random() - 0.5);
    return list;
  }, [store.questions, mode, topicId]);

  const current = pool[index % Math.max(pool.length, 1)];

  async function rate(rating: "forgot" | "hard" | "good" | "easy") {
    if (!current) return;
    await store.recordReview({ question: current, rating, userAnswer: answer, seconds: Math.round((Date.now() - startedAt) / 1000) });
    setIndex((value) => value + 1);
    setRevealed(false);
    setAnswer("");
    setStartedAt(Date.now());
  }

  return (
    <>
      <PageHeader title="Practice" eyebrow="Active recall first, answer second, rating last." />
      <div className="card button-row">
        {(["due", "topic", "weak", "random"] as Mode[]).map((item) => <button className={`btn ${mode === item ? "primary" : ""}`} key={item} onClick={() => { setMode(item); setIndex(0); }}>{item === "due" ? "Due Practice" : item === "topic" ? "Topic Practice" : item === "weak" ? "Weak Questions" : "Random Practice"}</button>)}
        {mode === "topic" ? <select className="select" style={{ maxWidth: 260 }} value={topicId} onChange={(event) => setTopicId(event.target.value)}><option value="">Choose topic</option>{store.topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}</select> : null}
      </div>
      <section className="card raised" style={{ marginTop: 20 }}>
        {current ? (
          <div className="grid">
            <span className="pill">{current.topic_title} · {current.difficulty}</span>
            <h2>{current.question}</h2>
            <label className="field"><span>Your answer</span><textarea className="textarea" value={answer} onChange={(event) => setAnswer(event.target.value)} /></label>
            {!revealed ? <button className="btn primary" onClick={() => setRevealed(true)}>Reveal answer</button> : <><div className="card"><h3>Answer</h3><p>{current.answer}</p></div><RatingButtons onRate={rate} /></>}
          </div>
        ) : <EmptyState>No questions are ready for this mode. Import a Q&A set or choose another practice mode.</EmptyState>}
      </section>
    </>
  );
}
