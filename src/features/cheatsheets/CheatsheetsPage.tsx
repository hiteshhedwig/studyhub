import { useMemo, useState } from "react";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { useAppStore } from "../../store/appStore";
import { openLocalPath } from "../../services/fileStorage";

export function CheatsheetsPage() {
  const store = useAppStore();
  const { cheatsheets, topics } = store;
  const [search, setSearch] = useState("");
  const [topicId, setTopicId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const filtered = useMemo(() => cheatsheets.filter((item) => (!topicId || item.topic_id === topicId) && item.title.toLowerCase().includes(search.toLowerCase())), [cheatsheets, search, topicId]);

  return (
    <>
      <PageHeader title="Cheatsheets" eyebrow="Local files linked to sessions and revision plans." />
      <div className="card button-row">
        <input className="input" style={{ maxWidth: 320 }} placeholder="Search cheatsheets" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select className="select" style={{ maxWidth: 260 }} value={topicId} onChange={(event) => setTopicId(event.target.value)}><option value="">All topics</option>{topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}</select>
      </div>
      <section className="list" style={{ marginTop: 20 }}>
        {filtered.length ? filtered.map((sheet) => (
          <article className="card" key={sheet.id}>
            <div className="split">
              <div><h2>{sheet.title}</h2><p className="muted">{sheet.topic_title} · {sheet.file_type} · {sheet.file_path}</p></div>
              <div className="button-row">
                <button className="btn" onClick={() => void openLocalPath(sheet.file_path)}><ExternalLink size={17} />Open</button>
                <button className="btn icon" aria-label="Edit cheatsheet title" onClick={() => { setEditingId(sheet.id); setDraftTitle(sheet.title); }}><Pencil size={16} /></button>
                <button className="btn danger icon" aria-label="Delete cheatsheet" onClick={() => { if (confirm(`Delete cheatsheet "${sheet.title}"?`)) void store.deleteCheatsheet(sheet.id); }}><Trash2 size={16} /></button>
              </div>
            </div>
            {editingId === sheet.id ? <div className="button-row" style={{ marginTop: 12 }}><input className="input" style={{ maxWidth: 340 }} value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} /><button className="btn primary" onClick={() => { void store.updateCheatsheetTitle(sheet.id, draftTitle); setEditingId(""); }}>Save</button><button className="btn" onClick={() => setEditingId("")}>Cancel</button></div> : null}
          </article>
        )) : <EmptyState>No cheatsheets match this view. Attach one at the end of a study session.</EmptyState>}
      </section>
    </>
  );
}
