import { useMemo, useState } from "react";
import { Import, Trash2 } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { useAppStore } from "../../store/appStore";
import { parseQuestionImport } from "../../services/importQuestions";
import { pickLocalFile, readTextFile } from "../../services/fileStorage";
import { confirmDialog, toast } from "../../store/uiStore";

type Tab = "questions" | "sets";

export function QuestionBankPage() {
  const store = useAppStore();
  const [tab, setTab] = useState<Tab>("questions");
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [tag, setTag] = useState("");
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
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
                    <h2 style={{ margin: 0 }}>{question.question}</h2>
                    <button type="button" className="qa-toggle" onClick={() => toggleRevealed(question.id)}>
                      {isOpen ? "Hide answer" : "Show answer"}
                    </button>
                    {isOpen ? <p style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>{question.answer}</p> : null}
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
                  <button className="btn danger" onClick={() => void deleteSet(set.id, set.title)}><Trash2 size={17} />Delete set</button>
                </div>
              </article>
            );
          }) : <EmptyState>No question sets imported yet.</EmptyState>}
        </section>
      )}
    </>
  );
}
