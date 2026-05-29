import { useState } from "react";
import { useAppStore } from "../../store/appStore";
import { toast } from "../../store/uiStore";
import type { Difficulty, Question, QuestionSet } from "../../db/repositories/types";

export type EditorState = { mode: "add" } | { mode: "edit"; question: Question };

export function QuestionEditor({ state, sets, onClose }: { state: EditorState; sets: QuestionSet[]; onClose: () => void }) {
  const store = useAppStore();
  const isEdit = state.mode === "edit";
  const editQuestion = state.mode === "edit" ? state.question : null;

  const [question, setQuestion] = useState(editQuestion?.question ?? "");
  const [answer, setAnswer] = useState(editQuestion?.answer ?? "");
  const [difficulty, setDifficulty] = useState<Difficulty>(editQuestion?.difficulty ?? "medium");
  const [tags, setTags] = useState(editQuestion ? (JSON.parse(editQuestion.tags_json) as string[]).join(", ") : "");
  const [setId, setSetId] = useState(editQuestion?.question_set_id ?? sets[0]?.id ?? "");
  const [saving, setSaving] = useState(false);

  const currentSet = sets.find((s) => s.id === (editQuestion?.question_set_id ?? setId));

  async function save() {
    if (!question.trim() || !answer.trim()) {
      toast.danger("Question and answer are both required.");
      return;
    }
    if (!isEdit && !setId) {
      toast.danger("Pick a set for the question.");
      return;
    }
    const fields = {
      question: question.trim(),
      answer: answer.trim(),
      difficulty,
      tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean)
    };
    setSaving(true);
    try {
      if (isEdit && editQuestion) {
        await store.updateQuestion(editQuestion.id, fields);
        toast.success("Question updated. History kept.");
      } else {
        await store.addQuestion(setId, fields);
        toast.success("Question added.");
      }
      onClose();
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : "Could not save the question.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={() => !saving && onClose()}>
      <div className="modal question-editor" role="dialog" aria-modal="true" aria-labelledby="qe-title" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="qe-title" className="modal-title">{isEdit ? "Edit question" : "New question"}</h2>

        {isEdit ? (
          <p className="muted modal-body">In set: {currentSet ? `${currentSet.title} · ${currentSet.topic_title}` : "—"}</p>
        ) : (
          <label className="field">
            <span>Set</span>
            <select className="select" value={setId} onChange={(event) => setSetId(event.target.value)}>
              {sets.map((set) => <option key={set.id} value={set.id}>{set.title} · {set.topic_title}</option>)}
            </select>
          </label>
        )}

        <label className="field">
          <span>Question</span>
          <textarea className="textarea" rows={3} value={question} onChange={(event) => setQuestion(event.target.value)} />
        </label>
        <label className="field">
          <span>Answer (Markdown + LaTeX supported)</span>
          <textarea className="textarea" rows={6} value={answer} onChange={(event) => setAnswer(event.target.value)} />
        </label>

        <div className="button-row" style={{ alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "0 0 160px" }}>
            <span>Difficulty</span>
            <select className="select" value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>Tags (comma-separated)</span>
            <input className="input" value={tags} placeholder="definition, mechanism" onChange={(event) => setTags(event.target.value)} />
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn primary" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add question"}
          </button>
        </div>
      </div>
    </div>
  );
}
