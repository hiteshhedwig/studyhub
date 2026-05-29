import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { EmptyState } from "../ui/EmptyState";
import type { Question, ReviewAttempt, ReviewRating } from "../../db/repositories/types";

const RATING_LABEL: Record<ReviewRating, string> = { forgot: "Forgot", hard: "Hard", good: "Good", easy: "Easy" };
const PAGE = 8;
type Sort = "weakest" | "recent";
type Tip = { x: number; y: number; text: string };
type Selected = { x: number; y: number; question: Question; attempt: ReviewAttempt };

export function QuestionScoreHeatmap({ questions, attempts }: { questions: Question[]; attempts: ReviewAttempt[] }) {
  const [sort, setSort] = useState<Sort>("weakest");
  const [visible, setVisible] = useState(PAGE);
  const [tip, setTip] = useState<Tip | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);

  const byQuestion = useMemo(() => {
    const map = new Map<string, ReviewAttempt[]>();
    for (const attempt of attempts) {
      const list = map.get(attempt.question_id) ?? [];
      list.push(attempt);
      map.set(attempt.question_id, list);
    }
    return map;
  }, [attempts]);

  const rows = useMemo(() => {
    const list = questions.map((question) => ({ question, attempts: byQuestion.get(question.id) ?? [] }));
    if (sort === "recent") {
      list.sort((a, b) => (b.attempts.at(-1)?.reviewed_at ?? "").localeCompare(a.attempts.at(-1)?.reviewed_at ?? ""));
    } else {
      list.sort((a, b) => a.question.mastery_score - b.question.mastery_score);
    }
    return list;
  }, [questions, byQuestion, sort]);

  const practicedRows = rows.filter((row) => row.attempts.length > 0);
  const avgMastery = practicedRows.length
    ? Math.round(practicedRows.reduce((sum, row) => sum + row.question.mastery_score, 0) / practicedRows.length)
    : 0;
  const shaky = practicedRows.filter((row) => row.question.mastery_score < 45).length;

  useEffect(() => {
    if (!selected) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  function showTip(event: React.MouseEvent<HTMLSpanElement>, attempt: ReviewAttempt) {
    const rect = event.currentTarget.getBoundingClientRect();
    setTip({
      x: rect.left + rect.width / 2,
      y: rect.top,
      text: `${format(parseISO(attempt.reviewed_at), "MMM d, yyyy")} · ${RATING_LABEL[attempt.rating]} · ${attempt.time_spent_seconds}s`
    });
  }

  function selectCell(event: React.MouseEvent<HTMLSpanElement>, question: Question, attempt: ReviewAttempt) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(rect.left + rect.width / 2, 180), window.innerWidth - 180);
    setSelected({ x, y: rect.top, question, attempt });
    setTip(null);
  }

  if (questions.length === 0) return <EmptyState>No questions in this topic yet.</EmptyState>;

  return (
    <div className="qheat">
      <div className="qheat-summary muted">
        <span>{avgMastery}% avg mastery · {practicedRows.length} of {questions.length} practiced{shaky ? ` · ${shaky} shaky` : ""}</span>
        <div className="button-row" role="radiogroup" aria-label="Sort questions">
          <button type="button" className={`btn small ${sort === "weakest" ? "primary" : ""}`} onClick={() => setSort("weakest")}>Weakest</button>
          <button type="button" className={`btn small ${sort === "recent" ? "primary" : ""}`} onClick={() => setSort("recent")}>Recent</button>
        </div>
      </div>
      <div className="qheat-rows" onMouseLeave={() => setTip(null)}>
        {rows.slice(0, visible).map(({ question, attempts: qAttempts }) => (
          <div className="qheat-row" key={question.id}>
            <span className="qheat-q truncate" title={question.question}>{question.question}</span>
            <div className="qheat-cells">
              {qAttempts.length === 0 ? (
                <span className="qheat-empty">Not practiced yet</span>
              ) : (
                qAttempts.map((attempt) => (
                  <span
                    key={attempt.id}
                    className={`qheat-cell r-${attempt.rating}`}
                    aria-label={`${RATING_LABEL[attempt.rating]} on ${format(parseISO(attempt.reviewed_at), "MMM d, yyyy")}`}
                    onMouseEnter={(event) => showTip(event, attempt)}
                    onMouseMove={(event) => showTip(event, attempt)}
                    onClick={(event) => selectCell(event, question, attempt)}
                  />
                ))
              )}
            </div>
            <span className="qheat-mastery">{question.mastery_score}%</span>
          </div>
        ))}
      </div>

      {rows.length > visible ? (
        <button type="button" className="btn small qheat-more" onClick={() => setVisible((value) => value + PAGE)}>
          Show {Math.min(PAGE, rows.length - visible)} more · {rows.length - visible} hidden
        </button>
      ) : null}

      {tip && !selected ? (
        <div className="heatmap-tooltip" role="tooltip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>
      ) : null}

      {selected ? (
        <>
          <div className="heatmap-popover-backdrop" onClick={() => setSelected(null)} />
          <div className="heatmap-popover qattempt-popover" role="dialog" aria-label="Attempt detail" style={{ left: selected.x, top: selected.y }}>
            <p className="heatmap-popover-date">{format(parseISO(selected.attempt.reviewed_at), "EEEE, MMM d, yyyy · h:mm a")}</p>
            <p className="heatmap-popover-total muted">
              <span className={`qheat-dot r-${selected.attempt.rating}`} aria-hidden="true" /> {RATING_LABEL[selected.attempt.rating]} · {selected.attempt.time_spent_seconds}s
            </p>
            <p className="qattempt-label">Your answer that time</p>
            <p className="qattempt-answer">{selected.attempt.user_answer?.trim() || "(left blank)"}</p>
          </div>
        </>
      ) : null}
    </div>
  );
}
