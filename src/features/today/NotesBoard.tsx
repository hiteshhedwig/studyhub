import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useAppStore } from "../../store/appStore";
import { confirmDialog } from "../../store/uiStore";
import type { Note, NoteItem } from "../../db/repositories/types";

const COLORS = ["n1", "n2", "n3", "n4"];

function parseItems(json: string): NoteItem[] {
  try {
    return JSON.parse(json) as NoteItem[];
  } catch {
    return [];
  }
}

function NoteCard({ note }: { note: Note }) {
  const store = useAppStore();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [items, setItems] = useState<NoteItem[]>(() => parseItems(note.items_json));

  function persist(next: { title?: string; items?: NoteItem[]; color?: string }) {
    void store.updateNote(note.id, {
      title: next.title ?? title,
      items: next.items ?? items,
      color: next.color ?? note.color
    });
  }

  // Ticking works in both modes — checking off a goal shouldn't require entering edit.
  function toggleItem(itemId: string) {
    const next = items.map((item) => (item.id === itemId ? { ...item, done: !item.done } : item));
    setItems(next);
    persist({ items: next });
  }

  function addItem() {
    const next = [...items, { id: crypto.randomUUID(), text: "", done: false }];
    setItems(next);
    persist({ items: next });
  }
  function setItemText(itemId: string, text: string) {
    setItems((current) => current.map((item) => (item.id === itemId ? { ...item, text } : item)));
  }
  function removeItem(itemId: string) {
    const next = items.filter((item) => item.id !== itemId);
    setItems(next);
    persist({ items: next });
  }
  function done() {
    persist({ title, items });
    setEditing(false);
  }
  async function remove() {
    const ok = await confirmDialog({ title: "Delete this note?", confirmLabel: "Delete", tone: "danger" });
    if (ok) await store.deleteNote(note.id);
  }

  if (!editing) {
    return (
      <div className={`note-card ${note.color}`}>
        <div className="note-head">
          <span className="note-title-text">{title.trim() || "Untitled"}</span>
          <button type="button" className="note-icon-btn" onClick={() => setEditing(true)} aria-label="Edit note"><Pencil size={14} /></button>
        </div>
        {items.length ? (
          <ul className="note-items">
            {items.map((item) => (
              <li key={item.id} className={`note-item ${item.done ? "done" : ""}`}>
                <button type="button" className="note-check" onClick={() => toggleItem(item.id)} aria-pressed={item.done} aria-label={item.done ? "Mark not done" : "Mark done"}>
                  {item.done ? <Check size={12} /> : null}
                </button>
                <span className="note-item-text-view">{item.text || "—"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="note-empty">No items — tap edit to add.</p>
        )}
      </div>
    );
  }

  return (
    <div className={`note-card ${note.color} editing`}>
      <div className="note-head">
        <input
          className="note-title"
          placeholder="Title"
          value={title}
          autoFocus
          onChange={(event) => setTitle(event.target.value)}
        />
        <button type="button" className="btn small" onClick={done}>Done</button>
      </div>

      <ul className="note-items">
        {items.map((item) => (
          <li key={item.id} className={`note-item ${item.done ? "done" : ""}`}>
            <button type="button" className="note-check" onClick={() => toggleItem(item.id)} aria-pressed={item.done} aria-label={item.done ? "Mark not done" : "Mark done"}>
              {item.done ? <Check size={12} /> : null}
            </button>
            <input
              className="note-item-text"
              placeholder="Goal…"
              value={item.text}
              onChange={(event) => setItemText(item.id, event.target.value)}
              onBlur={() => persist({ items })}
            />
            <button type="button" className="note-icon-btn danger" onClick={() => removeItem(item.id)} aria-label="Remove item"><X size={12} /></button>
          </li>
        ))}
      </ul>

      <button type="button" className="note-add-item" onClick={addItem}><Plus size={13} /> Add item</button>

      <div className="note-foot">
        <div className="note-colors">
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`note-swatch ${color}${note.color === color ? " active" : ""}`}
              onClick={() => persist({ color })}
              aria-label={`Set color ${color}`}
            />
          ))}
        </div>
        <button type="button" className="note-delete-full" onClick={() => void remove()}><Trash2 size={13} /> Delete</button>
      </div>
    </div>
  );
}

export function NotesBoard({ notes }: { notes: Note[] }) {
  const store = useAppStore();
  return (
    <>
      <div className="split">
        <h2 style={{ margin: 0 }}>Notes &amp; goals</h2>
        <button type="button" className="btn small" onClick={() => void store.addNote()}><Plus size={15} />Add note</button>
      </div>
      {notes.length ? (
        <div className="notes-grid">
          {notes.map((note) => <NoteCard key={note.id} note={note} />)}
        </div>
      ) : (
        <p className="muted" style={{ margin: 0 }}>No notes yet — add goals, reminders, or anything you want front-and-center.</p>
      )}
    </>
  );
}
