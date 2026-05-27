import { useUiStore } from "../../store/uiStore";

export function ToastViewport() {
  const toasts = useUiStore((state) => state.toasts);
  const dismiss = useUiStore((state) => state.dismissToast);
  if (toasts.length === 0) return null;
  return (
    <div className="toast-viewport" role="region" aria-label="Notifications">
      {toasts.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`toast toast-${item.tone}`}
          onClick={() => dismiss(item.id)}
          aria-label={`Dismiss notification: ${item.message}`}
        >
          <span className="toast-dot" aria-hidden="true" />
          <span className="toast-message">{item.message}</span>
          <span className="toast-x" aria-hidden="true">×</span>
        </button>
      ))}
    </div>
  );
}
