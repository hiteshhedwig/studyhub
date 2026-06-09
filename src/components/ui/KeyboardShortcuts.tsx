import { useEffect, useState } from "react";

type Shortcut = { keys: string[]; label: string };
type Group = { title: string; shortcuts: Shortcut[] };

const GROUPS: Group[] = [
  {
    title: "Global",
    shortcuts: [
      { keys: ["?"], label: "Show this shortcut list" },
      { keys: ["Space"], label: "Pause / resume the running timer" },
      { keys: ["Alt+C"], label: "Open / close the calculator" }
    ]
  },
  {
    title: "Practice",
    shortcuts: [
      { keys: ["Space"], label: "Reveal answer, then go to next" },
      { keys: ["→", "N"], label: "Skip to next question" },
      { keys: ["1"], label: "Rate: Forgot" },
      { keys: ["2"], label: "Rate: Hard" },
      { keys: ["3"], label: "Rate: Good" },
      { keys: ["4"], label: "Rate: Easy" }
    ]
  }
];

function isTypingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);

  // "?" (Shift + /) toggles the overlay from anywhere except while typing.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key === "?" && !isTypingInField(event.target)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={() => setOpen(false)}>
      <div
        className="modal shortcuts-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="split">
          <h2 id="shortcuts-title" className="modal-title">Keyboard shortcuts</h2>
          <button type="button" className="btn small" onClick={() => setOpen(false)}>Close</button>
        </div>
        {GROUPS.map((group) => (
          <div key={group.title} className="shortcuts-group">
            <p className="shortcuts-group-title">{group.title}</p>
            <ul className="shortcuts-list">
              {group.shortcuts.map((shortcut) => (
                <li key={shortcut.label} className="shortcuts-row">
                  <span className="shortcuts-keys">
                    {shortcut.keys.map((key, i) => (
                      <span key={key}>
                        {i > 0 ? <span className="shortcuts-or">or</span> : null}
                        <kbd className="kbd">{key}</kbd>
                      </span>
                    ))}
                  </span>
                  <span className="muted">{shortcut.label}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
