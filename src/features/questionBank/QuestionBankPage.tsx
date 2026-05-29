import { useMemo, useState } from "react";
import { Import, RefreshCw, Trash2 } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { RichText } from "../../components/ui/RichText";
import { DiffView } from "../../components/ui/DiffView";
import { useAppStore } from "../../store/appStore";
import { parseQuestionImport, type QuestionImport } from "../../services/importQuestions";
import type { QuestionSetTextDiff } from "../../db/repositories/studyRepository";
import { pickLocalFile, readTextFile } from "../../services/fileStorage";
import { confirmDialog, toast } from "../../store/uiStore";

type UpdatePreview = { setId: string; title: string; data: QuestionImport; diff: QuestionSetTextDiff };

type Tab = "questions" | "sets";

export function QuestionBankPage() {
  const store = useAppStore();
  const [tab, setTab] = useState<Tab>("questions");
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [tag, setTag] = useState("");
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<UpdatePreview | null>(null);
  const [applying, setApplying] = useState(false);
  const tags = [...new Set(store.questions.flatMap((question) => JSON.parse(question.tags_json) as string[]))].sort();
  const filtered = useMemo(
    () =>
      store.questions.filter((question) => {
        const haystack = `${question.question} ${question.answer} ${question.topic_title}`.toLowerCase();
        const tagList = JSON.parse(question.tags_json) as string[];
        return haystack.includes(search.toLowerCase()) && (!difficulty || question.difficulty === difficulty) && (!tag || tagList.includes(tag));
      }),
    [store.questions, search, difficulty, tag]
  );

  async function importJson() {
    const path = await pickLocalFile(["json"]);
    if (!path) return;
    try {
      const result = parseQuestionImport(await readTextFile(path));
      if (!result.ok) {
        toast.danger(result.error);
        return;
      }
      await store.importQuestionSet(result.data);
      toast.success(`Imported ${result.data.questions.length} questions into ${result.data.topic}.`);
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : "Could not import that Q&A file.");
    }
  }

  async function updateSetFromJson(setId: string, title: string, questionCount: number) {
    const path = await pickLocalFile(["json"]);
    if (!path) return;
    try {
      const result = parseQuestionImport(await readTextFile(path));
      if (!result.ok) {
        toast.danger(result.error);
        return;
      }
      if (result.data.questions.length !== questionCount) {
        toast.danger(`This file has ${result.data.questions.length} questions but "${title}" has ${questionCount}. Counts must match (same questions, same order) to update in place.`);
        return;
      }
      const diff = await store.previewQuestionSetText(setId, result.data);
      setPreview({ setId, title, data: result.data, diff });
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : "Could not read that file.");
    }
  }

  async function applyPreview() {
    if (!preview) return;
    setApplying(true);
    try {
      const updated = await store.updateQuestionSetText(preview.setId, preview.data);
      toast.success(`Updated ${updated} questions in "${preview.title}". History preserved.`);
      setPreview(null);
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : "Could not update that set.");
    } finally {
      setApplying(false);
    }
  }

  async function deleteSet(setId: string, title: string) {
    const ok = await confirmDialog({
      title: `Delete set "${title}"?`,
      message: "Every question in this set is deleted with it.",
      confirmLabel: "Delete set",
      tone: "danger"
    });
    if (!ok) return;
    await store.deleteQuestionSet(setId);
    toast.success("Question set deleted.");
  }

  function toggleRevealed(id: string) {
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function revealAll() {
    setRevealed(new Set(filtered.map((q) => q.id)));
  }

  function hideAll() {
    setRevealed(new Set());
  }

  return (
    <>
      <PageHeader
        title="Question Bank"
        eyebrow="ChatGPT-generated Q&A, validated before it enters your local database."
        actions={<button className="btn primary" onClick={importJson}><Import size={17} />Import JSON</button>}
      />
      <div className="card button-row" style={{ gap: 8 }}>
        <button className={`btn ${tab === "questions" ? "primary" : ""}`} type="button" onClick={() => setTab("questions")}>Questions ({store.questions.length})</button>
        <button className={`btn ${tab === "sets" ? "primary" : ""}`} type="button" onClick={() => setTab("sets")}>Sets ({store.questionSets.length})</button>
      </div>

      {tab === "questions" ? (
        <>
          <div className="card grid" style={{ marginTop: 12 }}>
            <div className="button-row">
              <input className="input" style={{ maxWidth: 340 }} placeholder="Search questions" value={search} onChange={(event) => setSearch(event.target.value)} />
              <select className="select" style={{ maxWidth: 180 }} value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
                <option value="">All difficulties</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
              <select className="select" style={{ maxWidth: 220 }} value={tag} onChange={(event) => setTag(event.target.value)}>
                <option value="">All tags</option>
                {tags.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <button className="btn" type="button" onClick={revealed.size === 0 ? revealAll : hideAll}>
                {revealed.size === 0 ? "Reveal answers" : "Hide answers"}
              </button>
            </div>
          </div>
          <section className="list" style={{ marginTop: 20 }}>
            {filtered.length ? filtered.map((question) => {
              const isOpen = revealed.has(question.id);
              return (
                <article className="card" key={question.id}>
                  <div className="qa-row">
                    <span className="pill">{question.topic_title} · {question.difficulty}</span>
                    <RichText className="prompt">{question.question}</RichText>
                    <button type="button" className="qa-toggle" onClick={() => toggleRevealed(question.id)}>
                      {isOpen ? "Hide answer" : "Show answer"}
                    </button>
                    {isOpen ? <RichText>{question.answer}</RichText> : null}
                    <p className="muted" style={{ margin: 0 }}>Due {new Date(question.next_due_at).toLocaleDateString()} · Mastery {question.mastery_score}%</p>
                  </div>
                </article>
              );
            }) : <EmptyState>No questions match this filter.</EmptyState>}
          </section>
        </>
      ) : (
        <section className="list" style={{ marginTop: 20 }}>
          {store.questionSets.length ? store.questionSets.map((set) => {
            const setQuestions = store.questions.filter((q) => q.question_set_id === set.id);
            return (
              <article className="card" key={set.id}>
                <div className="split">
                  <div>
                    <h2 style={{ margin: 0 }}>{set.title}</h2>
                    <p className="muted">{set.topic_title} · {setQuestions.length} questions · source: {set.source}</p>
                  </div>
                  <div className="button-row">
                    <button className="btn" onClick={() => void updateSetFromJson(set.id, set.title, setQuestions.length)}><RefreshCw size={17} />Update from JSON</button>
                    <button className="btn danger" onClick={() => void deleteSet(set.id, set.title)}><Trash2 size={17} />Delete set</button>
                  </div>
                </div>
              </article>
            );
          }) : <EmptyState>No question sets imported yet.</EmptyState>}
        </section>
      )}

      {preview ? (
        <div className="modal-backdrop" onMouseDown={() => !applying && setPreview(null)}>
          <div className="modal diff-modal" role="dialog" aria-modal="true" aria-labelledby="diff-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="split">
              <h2 id="diff-title" className="modal-title">Preview update · {preview.title}</h2>
              <button type="button" className="btn small" onClick={() => setPreview(null)} disabled={applying}>Close</button>
            </div>
            <p className="muted modal-body">
              {preview.diff.changed} of {preview.diff.total} questions change. Review history (mastery, due dates, past attempts) is kept.
            </p>
            <div className="diff-scroll">
              {preview.diff.changed === 0 ? (
                <EmptyState>This file's text is identical to what's already stored — nothing to update.</EmptyState>
              ) : (
                preview.diff.items
                  .filter((item) => item.questionChanged || item.answerChanged)
                  .map((item) => (
                    <div className="diff-item" key={item.index}>
                      <p className="diff-item-label">Question {item.index + 1}</p>
                      {item.questionChanged ? (
                        <>
                          <p className="diff-field-label">Question</p>
                          <DiffView before={item.oldQuestion} after={item.newQuestion} />
                        </>
                      ) : null}
                      {item.answerChanged ? (
                        <>
                          <p className="diff-field-label">Answer</p>
                          <DiffView before={item.oldAnswer} after={item.newAnswer} />
                        </>
                      ) : null}
                    </div>
                  ))
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setPreview(null)} disabled={applying}>Cancel</button>
              <button type="button" className="btn primary" onClick={() => void applyPreview()} disabled={applying || preview.diff.changed === 0}>
                {applying ? "Updating…" : `Update ${preview.diff.total} questions`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
