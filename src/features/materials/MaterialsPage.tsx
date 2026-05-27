import { useState } from "react";
import { FilePlus2, Import } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { useAppStore } from "../../store/appStore";
import { inferFileType, pickLocalFile, readTextFile } from "../../services/fileStorage";
import { parseQuestionImport } from "../../services/importQuestions";
import { toast } from "../../store/uiStore";

export function MaterialsPage() {
  const store = useAppStore();
  const [topicId, setTopicId] = useState(store.topics[0]?.id ?? "");
  const [showNewTopic, setShowNewTopic] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [newTopicCategory, setNewTopicCategory] = useState("");
  const [creating, setCreating] = useState(false);

  const selectedTopic = store.topics.find((topic) => topic.id === topicId);
  const topicSheets = store.cheatsheets.filter((sheet) => sheet.topic_id === topicId);
  const topicSets = store.questionSets.filter((set) => set.topic_id === topicId);

  async function handleCreateTopic() {
    const title = newTopicTitle.trim();
    if (!title) {
      toast.warning("Give the topic a title.");
      return;
    }
    setCreating(true);
    try {
      const categoryName = newTopicCategory.trim() || "Personal Study";
      let category = store.categories.find((item) => item.name.toLowerCase() === categoryName.toLowerCase());
      if (!category) category = await store.createCategory(categoryName);
      const topic = await store.createTopic({ categoryId: category.id, title });
      setTopicId(topic.id);
      setNewTopicTitle("");
      setNewTopicCategory("");
      setShowNewTopic(false);
      toast.success(`Created topic "${topic.title}".`);
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : "Could not create the topic.");
    } finally {
      setCreating(false);
    }
  }

  async function attachCheatsheet() {
    if (!topicId) {
      toast.warning("Choose a topic before attaching a cheatsheet.");
      return;
    }
    const path = await pickLocalFile();
    if (!path) return;
    const title = path.split(/[\\/]/).pop() ?? "Cheatsheet";
    await store.addCheatsheet({ topicId, title, filePath: path, fileType: inferFileType(path) });
    toast.success(`Attached ${title} to ${selectedTopic?.title ?? "topic"}.`);
  }

  async function importQuestions() {
    if (!topicId) {
      toast.warning("Choose a topic before importing Q&A.");
      return;
    }
    const path = await pickLocalFile(["json"]);
    if (!path) return;
    try {
      const parsed = parseQuestionImport(await readTextFile(path));
      if (!parsed.ok) {
        toast.danger(parsed.error);
        return;
      }
      await store.importQuestionSetForTopic(parsed.data, topicId);
      toast.success(`Imported ${parsed.data.questions.length} questions into ${selectedTopic?.title ?? "topic"}.`);
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : "Could not import that Q&A file.");
    }
  }

  return (
    <>
      <PageHeader title="Materials" eyebrow="Load existing cheatsheets and Q&A into a topic without starting a Pomodoro." />
      <section className="grid two">
        <div className="card grid">
          <h2>Add materials</h2>
          <label className="field">
            <span>Topic</span>
            <select className="select" value={topicId} onChange={(event) => setTopicId(event.target.value)}>
              <option value="">Choose topic</option>
              {store.topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}
            </select>
          </label>
          <div className="button-row">
            <button className="btn" type="button" onClick={() => setShowNewTopic((open) => !open)}>
              {showNewTopic ? "Cancel new topic" : "+ New topic"}
            </button>
          </div>
          {showNewTopic ? (
            <div className="card grid">
              <h3 style={{ margin: 0 }}>New topic</h3>
              <p className="muted" style={{ marginTop: 0 }}>For materials you already have locally — no Pomodoro required.</p>
              <label className="field">
                <span>Topic title</span>
                <input className="input" value={newTopicTitle} onChange={(event) => setNewTopicTitle(event.target.value)} placeholder="Decision Trees" autoFocus />
              </label>
              <label className="field">
                <span>Category (existing or new)</span>
                <input className="input" list="materials-category-options" value={newTopicCategory} onChange={(event) => setNewTopicCategory(event.target.value)} placeholder="Personal Study" />
                <datalist id="materials-category-options">
                  {store.categories.map((category) => <option key={category.id} value={category.name} />)}
                </datalist>
              </label>
              <div className="button-row">
                <button className="btn primary" type="button" onClick={handleCreateTopic} disabled={creating}>{creating ? "Creating…" : "Create topic"}</button>
              </div>
            </div>
          ) : null}
          <div className="button-row">
            <button className="btn" onClick={attachCheatsheet}><FilePlus2 size={17} />Attach cheatsheet</button>
            <button className="btn primary" onClick={importQuestions}><Import size={17} />Import Q&A JSON</button>
          </div>
        </div>

        <div className="card grid">
          <h2>{selectedTopic ? selectedTopic.title : "Topic materials"}</h2>
          {selectedTopic ? (
            <div className="grid two">
              <div>
                <h3>Cheatsheets</h3>
                {topicSheets.length ? <div className="list">{topicSheets.map((sheet) => <div className="list-item" key={sheet.id}>{sheet.title}<span className="muted">{sheet.file_type}</span></div>)}</div> : <EmptyState>No cheatsheets attached.</EmptyState>}
              </div>
              <div>
                <h3>Q&A sets</h3>
                {topicSets.length ? <div className="list">{topicSets.map((set) => <div className="list-item" key={set.id}>{set.title}<span className="muted">{set.source}</span></div>)}</div> : <EmptyState>No question sets imported.</EmptyState>}
              </div>
            </div>
          ) : <EmptyState>Create or choose a topic first.</EmptyState>}
        </div>
      </section>
    </>
  );
}
