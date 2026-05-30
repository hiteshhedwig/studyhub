import { useEffect, useMemo, useState } from "react";
import { parseISO } from "date-fns";
import { Download, FileUp, Sparkles } from "lucide-react";
import { isQuestionDue } from "../services/spacedRepetition";
import { RichText } from "../components/ui/RichText";
import { RatingButtons } from "../components/ui/RatingButtons";
import { buildPracticeFile, openTextFile, parseQuestionsFile, practiceFileName, saveTextFile } from "../services/practiceSyncService";
import { usePracticeStore } from "./practiceStore";
import type { ReviewRating } from "../db/repositories/types";

function shuffleWithSeed<T>(items: T[], seed: number): T[] {
  let state = seed || 1;
  const rng = () => {
    state = (state + 0x6d2b79f5) | 0;
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

export function PracticeWebApp() {
  const { questions, attempts, examDate, load, record } = usePracticeStore();
  const [mode, setMode] = useState<"due" | "all">("due");
  const [seed, setSeed] = useState(() => Date.now());
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [answer, setAnswer] = useState("");
  const [startedAt, setStartedAt] = useState(Date.now());

  const pool = useMemo(() => {
    if (questions.length === 0) return [];
    const exam = examDate ? parseISO(examDate) : null;
    const list = mode === "due" ? questions.filter((q) => isQuestionDue(q, exam)) : questions;
    return shuffleWithSeed(list, seed);
  }, [questions, mode, examDate, seed]);

  const current = pool.length ? pool[index % pool.length] : undefined;
  const currentId = current?.id;
  useEffect(() => {
    setRevealed(false);
    setAnswer("");
    setStartedAt(Date.now());
  }, [currentId]);

  async function loadQuestions() {
    if (attempts.length > 0 && !window.confirm(`Loading a new file will discard ${attempts.length} unexported practice ${attempts.length === 1 ? "rating" : "ratings"} on this device. Continue?`)) {
      return;
    }
    const text = await openTextFile();
    if (!text) return;
    const parsed = parseQuestionsFile(text);
    if (!parsed.ok) {
      window.alert(parsed.error);
      return;
    }
    load(parsed.questions, parsed.examDate);
    setIndex(0);
    setSeed(Date.now());
  }

  async function exportPractice() {
    if (attempts.length === 0) {
      window.alert("No practice recorded yet — rate a few cards first.");
      return;
    }
    await saveTextFile(practiceFileName("studyhub-practice"), buildPracticeFile(attempts));
  }

  function rate(rating: ReviewRating) {
    if (!current) return;
    record(current.id, rating, answer, Math.round((Date.now() - startedAt) / 1000));
    setIndex((value) => value + 1);
  }

  if (questions.length === 0) {
    return (
      <div className="pw-shell">
        <div className="pw-import">
          <span className="pw-mark" aria-hidden="true"><Sparkles size={26} /></span>
          <h1>Study Hub · Practice</h1>
          <p className="muted">Load the questions file you exported from the desktop app (Settings → Practice sync), then practice anywhere. Your ratings are saved on this device until you export them back.</p>
          <button className="btn primary" type="button" onClick={() => void loadQuestions()}><FileUp size={17} />Load questions</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pw-shell">
      <header className="pw-header">
        <h1>Practice</h1>
        <div className="button-row">
          <button className="btn small" type="button" onClick={() => void loadQuestions()} title="Load questions"><FileUp size={15} /></button>
          <button className="btn small" type="button" onClick={() => void exportPractice()} title="Export practice">
            <Download size={15} />{attempts.length ? ` ${attempts.length}` : ""}
          </button>
        </div>
      </header>

      <main className="pw-main">
        <div className="pw-modes">
          <button className={`btn small ${mode === "due" ? "primary" : ""}`} type="button" onClick={() => { setMode("due"); setIndex(0); }}>Due</button>
          <button className={`btn small ${mode === "all" ? "primary" : ""}`} type="button" onClick={() => { setMode("all"); setIndex(0); }}>All</button>
          <button className="btn small" type="button" onClick={() => { setSeed(Date.now()); setIndex(0); }} title="Reshuffle">Shuffle</button>
        </div>

        {current ? (
          <section className="card raised pw-card">
            <div className="split">
              <span className="pill">{current.topic_title} · {current.difficulty}</span>
              <span className="muted">{(index % pool.length) + 1} / {pool.length}</span>
            </div>
            <RichText className="prompt">{current.question}</RichText>
            <label className="field">
              <span>Your answer</span>
              <textarea className="textarea" value={answer} onChange={(event) => setAnswer(event.target.value)} />
            </label>
            {!revealed ? (
              <div className="button-row">
                <button className="btn primary" type="button" onClick={() => setRevealed(true)}>Reveal answer</button>
                <button className="btn" type="button" onClick={() => setIndex((value) => value + 1)}>Skip</button>
              </div>
            ) : (
              <>
                <div className="card"><h3>Answer</h3><RichText>{current.answer}</RichText></div>
                <RatingButtons onRate={rate} />
              </>
            )}
          </section>
        ) : (
          <section className="card pw-empty">
            <p>All caught up — nothing due right now.</p>
            <button className="btn" type="button" onClick={() => { setMode("all"); setIndex(0); }}>Practice all questions</button>
          </section>
        )}
      </main>
    </div>
  );
}
