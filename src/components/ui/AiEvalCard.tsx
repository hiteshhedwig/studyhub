import { Minus, Sparkles, X } from "lucide-react";
import type { EvaluationResult } from "../../services/aiEvaluationService";

function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function scoreTone(score: number): "good" | "mid" | "bad" {
  if (score >= 8) return "good";
  if (score >= 5) return "mid";
  return "bad";
}

function PointList({ title, items, kind }: { title: string; items: string[]; kind: "missed" | "bad" }) {
  if (items.length === 0) return null;
  const Icon = kind === "missed" ? Minus : X;
  return (
    <div className={`ai-points ai-points-${kind}`}>
      <p className="ai-points-title">{title}</p>
      <ul>
        {items.map((item, i) => (
          <li key={i}><Icon size={14} aria-hidden="true" /><span>{item}</span></li>
        ))}
      </ul>
    </div>
  );
}

export function AiEvalCard({ result }: { result: EvaluationResult }) {
  const tone = scoreTone(result.score);
  return (
    <div className="ai-eval">
      <div className="ai-eval-head">
        <span className="ai-eval-tag"><Sparkles size={13} aria-hidden="true" /> AI evaluation</span>
        <span className={`ai-verdict v-${tone}`}>{titleCase(result.verdict)}</span>
        <span className={`ai-score tone-${tone}`}>
          <span className="ai-score-num">{result.score}</span><span className="ai-score-den">/10</span>
        </span>
      </div>
      <div className="ai-score-bar">
        <span className={`tone-${tone}`} style={{ width: `${Math.max(0, Math.min(100, result.score * 10))}%` }} />
      </div>
      <PointList title="Missed" items={result.missed_points} kind="missed" />
      <PointList title="Incorrect" items={result.incorrect_points} kind="bad" />
      {result.interview_feedback ? <p className="ai-feedback">{result.interview_feedback}</p> : null}
    </div>
  );
}
