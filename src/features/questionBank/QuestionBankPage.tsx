import { useMemo, useState } from "react";
import { Import, Trash2 } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { useAppStore } from "../../store/appStore";
import { parseQuestionImport } from "../../services/importQuestions";
import { pickLocalFile, readTextFile } from "../../services/fileStorage";

export function QuestionBankPage() {
  const store = useAppStore();
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [tag, setTag] = useState("");
  const [message, setMessage] = useState("");
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
        setMessage(result.error);
        return;
      }
      await store.importQuestionSet(result.data);
      setMessage(`Imported ${result.data.questions.length} questions into ${result.data.topic}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not import that Q&A file.");
    }
  }

  return (
    <>
      <PageHeader title="Question Bank" eyebrow="ChatGPT-generated Q&A, validated before it enters your local database." actions={<button className="btn primary" onClick={importJson}><Import size={17} />Import JSON</button>} />
      <div className="card grid">
        <div className="button-row">
          <input className="input" style={{ maxWidth: 340 }} placeholder="Search questions" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select className="select" style={{ maxWidth: 180 }} value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="">All difficulty</option><option>easy</option><option>medium</option><option>hard</option></select>
          <select className="select" style={{ maxWidth: 220 }} value={tag} onChange={(event) => setTag(event.target.value)}><option value="">All tags</option>{tags.map((item) => <option key={item}>{item}</option>)}</select>
        </div>
        {message ? <p className="muted">{message}</p> : null}
      </div>
      <section className="list" style={{ marginTop: 20 }}>
        {store.questionSets.length ? <div className="card"><h2>Question sets</h2><div className="list">{store.questionSets.map((set) => <div className="list-item" key={set.id}><div className="split"><span>{set.title} <span className="muted">· {set.topic_title}</span></span><button className="btn danger" onClick={() => { if (confirm(`Delete question set "${set.title}" and its questions?`)) void store.deleteQuestionSet(set.id); }}><Trash2 size={17} />Delete set</button></div></div>)}</div></div> : null}
        {filtered.length ? filtered.map((question) => (
          <article className="card" key={question.id}>
            <div className="split">
              <div>
                <span className="pill">{question.topic_title} · {question.difficulty}</span>
                <h2>{question.question}</h2>
                <p className="muted">{question.answer}</p>
                <p className="muted">Due {new Date(question.next_due_at).toLocaleDateString()} · Mastery {question.mastery_score}%</p>
              </div>
              <button className="btn danger icon" aria-label="Delete question" onClick={() => { if (confirm("Delete this question?")) void store.deleteQuestion(question.id); }}><Trash2 size={16} /></button>
            </div>
          </article>
        )) : <EmptyState>No questions match this filter.</EmptyState>}
      </section>
    </>
  );
}
