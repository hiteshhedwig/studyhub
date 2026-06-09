import { useEffect, useMemo, useRef, useState } from "react";
import { parseISO } from "date-fns";
import { Download, FileUp, Sparkles, X } from "lucide-react";
import { buildTopicReviewSet, isQuestionDue } from "../services/spacedRepetition";
import { RichText } from "../components/ui/RichText";
import { RatingButtons } from "../components/ui/RatingButtons";
import { APP_VERSION, buildPracticeFile, openTextFile, parseQuestionsFile, practiceFileName, saveTextFile } from "../services/practiceSyncService";
import { usePracticeStore } from "./practiceStore";
import type { ReviewRating } from "../db/repositories/types";
import type { ExportedQuestion } from "../db/repositories/studyRepository";

// Recall time is bounded the same way the desktop bounds it (10 min/card), so an
// abandoned card can't bloat the synced practice time.
const CARD_CAP_SECONDS = 600;

/** -1 / 0 / 1 — compares dotted versions like "0.1.28" numerically, segment by segment. */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

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
  const { questions, attempts, examDate, topicReviews, load, record, setReviewSession, setCompletedReviews } = usePracticeStore();
  // A review left open when the app was closed lives in the persisted store, so we
  // resume from it on mount rather than starting fresh (the rated cards are saved
  // in `attempts` either way — this restores the cursor and the "recalled" tally).
  const savedSession = usePracticeStore.getState().reviewSession;
  const [mode, setMode] = useState<"due" | "all" | "reviews">(() => (savedSession ? "reviews" : "due"));
  const [topicId, setTopicId] = useState("");
  const [seed, setSeed] = useState(() => Date.now());
  const [index, setIndex] = useState(() => savedSession?.index ?? 0);
  const [revealed, setRevealed] = useState(false);
  const [answer, setAnswer] = useState("");
  const [startedAt, setStartedAt] = useState(Date.now());
  // When the current card was revealed — recorded recall time is start→reveal, to
  // match the desktop (studying the answer afterwards isn't counted as practice time).
  const revealedAtRef = useRef<number | null>(null);
  // Non-blocking banner when the loaded file's Study Hub version differs from this web app.
  const [versionNotice, setVersionNotice] = useState<string | null>(null);
  // Topic-review state: which topic's recall set is open, the frozen set itself
  // (built once on entry so mid-session rating changes don't reshuffle it), and the
  // topics finished this session — a local "✓ reviewed" cue (the desktop closes the
  // nudge itself from the merged attempts). All three are mirrored into the store
  // so a mid-review reload keeps your place instead of resetting to zero.
  const [activeReview, setActiveReview] = useState<string | null>(() => savedSession?.topicId ?? null);
  const [reviewPool, setReviewPool] = useState<ExportedQuestion[]>(() => {
    if (!savedSession) return [];
    const byId = new Map(usePracticeStore.getState().questions.map((q) => [q.id, q]));
    return savedSession.poolIds.map((id) => byId.get(id)).filter((q): q is ExportedQuestion => Boolean(q));
  });
  const [completedReviews, setLocalCompletedReviews] = useState<Set<string>>(() => new Set(usePracticeStore.getState().completedReviews));
  // Cards actually rated in the current review — skips advance position but don't
  // count toward "recalled", so the tally and completion summary stay honest.
  const [reviewedCount, setReviewedCount] = useState(() => savedSession?.reviewedCount ?? 0);

  // Distinct topics present in the loaded set, for the topic filter dropdown.
  const topics = useMemo(() => {
    const byId = new Map<string, string>();
    for (const q of questions) {
      if (q.topic_id && !byId.has(q.topic_id)) byId.set(q.topic_id, q.topic_title || "Untitled topic");
    }
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [questions]);

  // A topic that no longer exists after loading a new file shouldn't strand the
  // pool on an empty filter — fall back to all topics.
  useEffect(() => {
    if (topicId && !topics.some(([id]) => id === topicId)) setTopicId("");
  }, [topics, topicId]);

  // Topics that have a due topic review, with the size of the recall set the phone
  // would build for each. Deterministic order (by title) so the list is stable.
  const reviewTopics = useMemo(() => {
    if (questions.length === 0) return [] as { topicId: string; title: string; size: number }[];
    const exam = examDate ? parseISO(examDate) : null;
    const seen = new Set<string>();
    const out: { topicId: string; title: string; size: number }[] = [];
    for (const review of topicReviews) {
      if (seen.has(review.topic_id)) continue;
      seen.add(review.topic_id);
      const set = buildTopicReviewSet(questions, review.topic_id, exam);
      if (set.length === 0) continue;
      out.push({ topicId: review.topic_id, title: set[0].topic_title || "Untitled topic", size: set.length });
    }
    return out.sort((a, b) => a.title.localeCompare(b.title));
  }, [questions, topicReviews, examDate]);

  const pool = useMemo(() => {
    if (questions.length === 0) return [];
    if (mode === "reviews") return activeReview ? reviewPool : [];
    const exam = examDate ? parseISO(examDate) : null;
    let list = topicId ? questions.filter((q) => q.topic_id === topicId) : questions;
    if (mode === "due") list = list.filter((q) => isQuestionDue(q, exam));
    return shuffleWithSeed(list, seed);
  }, [questions, mode, topicId, examDate, seed, activeReview, reviewPool]);

  // A frozen review runs to its end rather than wrapping; once every card is rated
  // (or skipped) we show a completion card instead of looping back to the first.
  const reviewDone = mode === "reviews" && activeReview !== null && index >= reviewPool.length;
  const current = pool.length && !reviewDone ? pool[index % pool.length] : undefined;
  const activeReviewTitle = activeReview
    ? reviewTopics.find((topic) => topic.topicId === activeReview)?.title ?? reviewPool[0]?.topic_title ?? null
    : null;
  const currentId = current?.id;
  useEffect(() => {
    setRevealed(false);
    setAnswer("");
    setStartedAt(Date.now());
    revealedAtRef.current = null;
  }, [currentId]);

  // Stamp the recall→reveal moment once, the first time this card is revealed.
  useEffect(() => {
    if (revealed && revealedAtRef.current === null) revealedAtRef.current = Date.now();
  }, [revealed]);

  // Mark a review finished once its last card has been rated/skipped.
  useEffect(() => {
    if (reviewDone && activeReview && reviewedCount > 0) {
      setLocalCompletedReviews((prev) => (prev.has(activeReview) ? prev : new Set(prev).add(activeReview)));
    }
  }, [reviewDone, activeReview, reviewedCount]);

  // Mirror the live review cursor and the finished-topic set into the persisted
  // store so closing and reopening the app resumes where you left off.
  useEffect(() => {
    setReviewSession(
      activeReview ? { topicId: activeReview, poolIds: reviewPool.map((q) => q.id), index, reviewedCount } : null
    );
  }, [activeReview, reviewPool, index, reviewedCount, setReviewSession]);

  useEffect(() => {
    setCompletedReviews([...completedReviews]);
  }, [completedReviews, setCompletedReviews]);

  function startReview(reviewTopicId: string) {
    const exam = examDate ? parseISO(examDate) : null;
    setReviewPool(buildTopicReviewSet(questions, reviewTopicId, exam));
    setActiveReview(reviewTopicId);
    setIndex(0);
    setReviewedCount(0);
  }

  function exitReview() {
    setActiveReview(null);
    setReviewPool([]);
    setIndex(0);
    setReviewedCount(0);
  }

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
    // Version skew is informational only — the file still loads. Warn if it was
    // written by a different Study Hub release than this web app was built from.
    if (parsed.appVersion && parsed.appVersion !== APP_VERSION) {
      setVersionNotice(
        compareVersions(parsed.appVersion, APP_VERSION) > 0
          ? `This file is from a newer Study Hub (v${parsed.appVersion}); this web app is v${APP_VERSION}. It still works — update the web app for the latest features.`
          : `This file is from an older Study Hub (v${parsed.appVersion}); this web app is v${APP_VERSION}. It still works; re-export from the desktop if anything looks off.`
      );
    } else {
      setVersionNotice(null);
    }
    load(parsed.questions, parsed.examDate, parsed.topicReviews);
    setIndex(0);
    setSeed(Date.now());
    setMode("due");
    setActiveReview(null);
    setReviewPool([]);
    setReviewedCount(0);
    setLocalCompletedReviews(new Set());
  }

  async function exportPractice() {
    if (attempts.length === 0) {
      window.alert("No practice recorded yet — rate a few cards first.");
      return;
    }
    // Map the topics finished this session back to the review ids the desktop shipped,
    // so the merge can close those exact topic-review nudges.
    const completedReviewIds = topicReviews.filter((review) => completedReviews.has(review.topic_id)).map((review) => review.id);
    await saveTextFile(practiceFileName("studyhub-practice"), buildPracticeFile(attempts, completedReviewIds));
  }

  function rate(rating: ReviewRating) {
    if (!current) return;
    const recallEnd = revealedAtRef.current ?? Date.now();
    record(current.id, rating, answer, Math.min(Math.round((recallEnd - startedAt) / 1000), CARD_CAP_SECONDS));
    if (mode === "reviews" && activeReview) setReviewedCount((value) => value + 1);
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
        {versionNotice ? (
          <div className="pw-notice" role="status">
            <span>{versionNotice}</span>
            <button type="button" className="pw-notice-close" aria-label="Dismiss" onClick={() => setVersionNotice(null)}><X size={15} /></button>
          </div>
        ) : null}
        <div className="pw-modes">
          <button className={`btn small ${mode === "due" ? "primary" : ""}`} type="button" onClick={() => { setMode("due"); exitReview(); }}>Due</button>
          <button className={`btn small ${mode === "all" ? "primary" : ""}`} type="button" onClick={() => { setMode("all"); exitReview(); }}>All</button>
          <button className={`btn small ${mode === "reviews" ? "primary" : ""}`} type="button" onClick={() => { setMode("reviews"); exitReview(); }}>
            Reviews{reviewTopics.length ? ` ${reviewTopics.length}` : ""}
          </button>
          {mode !== "reviews" ? (
            <>
              <button className="btn small" type="button" onClick={() => { setSeed(Date.now()); setIndex(0); }} title="Reshuffle">Shuffle</button>
              {topics.length > 1 ? (
                <select
                  className="select pw-topic"
                  value={topicId}
                  onChange={(event) => { setTopicId(event.target.value); setIndex(0); setSeed(Date.now()); }}
                  aria-label="Filter by topic"
                >
                  <option value="">All topics</option>
                  {topics.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
                </select>
              ) : null}
            </>
          ) : activeReview ? (
            <button className="btn small" type="button" onClick={exitReview}>← Reviews</button>
          ) : null}
        </div>

        {mode === "reviews" && !activeReview ? (
          <section className="card pw-reviews">
            <div className="split">
              <h3 style={{ margin: 0 }}>Topic reviews due</h3>
              <span className="muted">{reviewTopics.length}</span>
            </div>
            {reviewTopics.length === 0 ? (
              <p className="muted">No topic reviews due right now. They show up here when the desktop app schedules a recall check for a topic — re-export your questions after one is due.</p>
            ) : (
              <ul className="pw-review-list">
                {reviewTopics.map((topic) => (
                  <li key={topic.topicId}>
                    <button className="btn pw-review-item" type="button" onClick={() => startReview(topic.topicId)}>
                      <span className="pw-review-title">{topic.title}</span>
                      <span className="muted">{completedReviews.has(topic.topicId) ? "✓ reviewed" : `${topic.size} card${topic.size === 1 ? "" : "s"}`}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : reviewDone ? (
          <section className="card pw-empty">
            <p>Recalled {reviewedCount} of {reviewPool.length} card{reviewPool.length === 1 ? "" : "s"}{activeReviewTitle ? ` for ${activeReviewTitle}` : ""}{reviewedCount < reviewPool.length ? ` (${reviewPool.length - reviewedCount} skipped)` : ""}. Export your practice to sync the ratings back to the desktop app.</p>
            <button className="btn" type="button" onClick={exitReview}>Back to reviews</button>
          </section>
        ) : current ? (
          <section className="card raised pw-card">
            <div className="split">
              <span className="pill">{current.topic_title} · {current.difficulty}</span>
              <span className="muted">{mode === "reviews" && activeReview ? `${reviewedCount} / ${pool.length} recalled` : `${(index % pool.length) + 1} / ${pool.length}`}</span>
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
        ) : mode === "reviews" ? (
          <section className="card pw-empty">
            <p>Nothing to recall for {activeReviewTitle ?? "this topic"} right now.</p>
            <button className="btn" type="button" onClick={exitReview}>Back to reviews</button>
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
