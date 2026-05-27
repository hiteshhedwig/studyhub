import { useEffect, useRef } from "react";
import { useUiStore } from "../../store/uiStore";

export function ConfirmDialog() {
  const confirm = useUiStore((state) => state.confirm);
  const resolve = useUiStore((state) => state.resolveConfirm);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!confirm) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        resolve(false);
      }
      if (event.key === "Enter") {
        event.preventDefault();
        resolve(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [confirm, resolve]);

  if (!confirm) return null;
  return (
    <div className="modal-backdrop" onMouseDown={() => resolve(false)}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-title" className="modal-title">{confirm.title}</h2>
        {confirm.message ? <p className="muted modal-body">{confirm.message}</p> : null}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => resolve(false)}>{confirm.cancelLabel}</button>
          <button
            ref={confirmRef}
            type="button"
            className={`btn ${confirm.tone === "danger" ? "danger" : "primary"}`}
            onClick={() => resolve(true)}
          >
            {confirm.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
