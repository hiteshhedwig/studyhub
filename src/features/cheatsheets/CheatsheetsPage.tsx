import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, FilePlus2, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { useAppStore } from "../../store/appStore";
import { inferFileType, openLocalPath, pickLocalFile } from "../../services/fileStorage";
import { confirmDialog, toast } from "../../store/uiStore";

export function CheatsheetsPage() {
  const store = useAppStore();
  const { cheatsheets, topics } = store;
  const [search, setSearch] = useState("");
  const [topicId, setTopicId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [dropOver, setDropOver] = useState(false);
  const filtered = useMemo(
    () => cheatsheets.filter((item) => (!topicId || item.topic_id === topicId) && item.title.toLowerCase().includes(search.toLowerCase())),
    [cheatsheets, search, topicId]
  );
  const selectedTopicTitle = topics.find((topic) => topic.id === topicId)?.title;

  // Tauri exposes absolute file paths on its drop event; the browser drop API
  // only gives us File handles without the absolute path we store in the DB.
  const topicIdRef = useRef(topicId);
  topicIdRef.current = topicId;
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    const unsubs: Array<() => void> = [];
    void import("@tauri-apps/api/event")
      .then(async ({ listen }) => {
        unsubs.push(await listen<string[]>("tauri://file-drop", async (event) => {
          setDropOver(false);
          const paths = Array.isArray(event.payload) ? event.payload : [];
          await addFiles(paths);
        }));
        unsubs.push(await listen("tauri://file-drop-hover", () => setDropOver(true)));
        unsubs.push(await listen("tauri://file-drop-cancelled", () => setDropOver(false)));
        cleanup = () => unsubs.forEach((fn) => fn());
      })
      .catch(() => undefined);
    return () => cleanup?.();
  }, []);

  async function addFiles(paths: string[]) {
    const targetTopicId = topicIdRef.current;
    if (!targetTopicId) {
      toast.warning("Pick a topic from the filter first so dropped files have a home.");
      return;
    }
    let added = 0;
    for (const path of paths) {
      const title = path.split(/[\\/]/).pop() ?? "Cheatsheet";
      await store.addCheatsheet({ topicId: targetTopicId, title, filePath: path, fileType: inferFileType(path) });
      added += 1;
    }
    if (added) {
      const topicLabel = topics.find((topic) => topic.id === targetTopicId)?.title ?? "topic";
      toast.success(added === 1 ? `Attached to ${topicLabel}.` : `Attached ${added} files to ${topicLabel}.`);
    }
  }

  async function browseAndAdd() {
    const path = await pickLocalFile();
    if (path) await addFiles([path]);
  }

  async function deleteSheet(sheetId: string, title: string) {
    const ok = await confirmDialog({
      title: `Delete "${title}"?`,
      message: "Removes the link from Study Hub. The file on disk is left alone.",
      confirmLabel: "Delete cheatsheet",
      tone: "danger"
    });
    if (!ok) return;
    await store.deleteCheatsheet(sheetId);
    toast.success("Cheatsheet removed.");
  }

  async function saveTitle(sheetId: string) {
    if (!draftTitle.trim()) {
      toast.warning("Title cannot be empty.");
      return;
    }
    await store.updateCheatsheetTitle(sheetId, draftTitle.trim());
    setEditingId("");
    toast.success("Renamed.");
  }

  return (
    <>
      <PageHeader title="Cheatsheets" eyebrow="Local files linked to sessions and revision plans." />
      <div className="card button-row">
        <input className="input" style={{ maxWidth: 320 }} placeholder="Search cheatsheets" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select className="select" style={{ maxWidth: 260 }} value={topicId} onChange={(event) => setTopicId(event.target.value)}>
          <option value="">All topics</option>
          {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}
        </select>
        <button className="btn" type="button" onClick={browseAndAdd}><FilePlus2 size={17} />Add file</button>
      </div>
      <div
        className={`dropzone${dropOver ? " over" : ""}`}
        style={{ marginTop: 12 }}
        onDragOver={(event) => { event.preventDefault(); setDropOver(true); }}
        onDragLeave={() => setDropOver(false)}
        onDrop={(event) => { event.preventDefault(); setDropOver(false); }}
      >
        {selectedTopicTitle
          ? <>Drop files here to attach them to <strong>{selectedTopicTitle}</strong></>
          : <>Pick a topic above, then drop files here or click <strong>Add file</strong></>}
      </div>
      <section className="list" style={{ marginTop: 20 }}>
        {filtered.length ? filtered.map((sheet) => (
          <article className="card" key={sheet.id}>
            <div className="split">
              <div style={{ minWidth: 0 }}>
                <h2>{sheet.title}</h2>
                <p className="muted truncate" title={sheet.file_path}>{sheet.topic_title} · {sheet.file_type} · {sheet.file_path}</p>
              </div>
              <div className="button-row">
                <button className="btn" onClick={() => void openLocalPath(sheet.file_path)}><ExternalLink size={17} />Open</button>
                <button className="btn icon" aria-label="Edit cheatsheet title" onClick={() => { setEditingId(sheet.id); setDraftTitle(sheet.title); }}><Pencil size={16} /></button>
                <button className="btn danger icon" aria-label="Delete cheatsheet" onClick={() => void deleteSheet(sheet.id, sheet.title)}><Trash2 size={16} /></button>
              </div>
            </div>
            {editingId === sheet.id ? (
              <div className="button-row" style={{ marginTop: 12 }}>
                <input className="input" style={{ maxWidth: 340 }} value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} autoFocus />
                <button className="btn primary" onClick={() => void saveTitle(sheet.id)}>Save</button>
                <button className="btn" onClick={() => setEditingId("")}>Cancel</button>
              </div>
            ) : null}
          </article>
        )) : <EmptyState>No cheatsheets match this view. Attach one above, end-of-session, or from Materials.</EmptyState>}
      </section>
    </>
  );
}
