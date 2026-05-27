import { create } from "zustand";

export type ToastTone = "info" | "success" | "warning" | "danger";

export type Toast = {
  id: string;
  tone: ToastTone;
  message: string;
  timeout: number;
};

type ConfirmRequest = {
  id: string;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: "default" | "danger";
  resolve: (confirmed: boolean) => void;
};

type UiState = {
  toasts: Toast[];
  confirm: ConfirmRequest | null;
  pushToast: (input: { tone?: ToastTone; message: string; timeoutMs?: number }) => string;
  dismissToast: (id: string) => void;
  requestConfirm: (input: {
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: "default" | "danger";
  }) => Promise<boolean>;
  resolveConfirm: (confirmed: boolean) => void;
};

export const useUiStore = create<UiState>((set, get) => ({
  toasts: [],
  confirm: null,
  pushToast: ({ tone = "info", message, timeoutMs = 3800 }) => {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts, { id, tone, message, timeout: timeoutMs }] }));
    if (timeoutMs > 0) {
      setTimeout(() => get().dismissToast(id), timeoutMs);
    }
    return id;
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  requestConfirm: ({ title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", tone = "default" }) =>
    new Promise<boolean>((resolve) => {
      const existing = get().confirm;
      if (existing) {
        // If a dialog is already open, reject the previous one to avoid leaks.
        existing.resolve(false);
      }
      set({
        confirm: {
          id: crypto.randomUUID(),
          title,
          message,
          confirmLabel,
          cancelLabel,
          tone,
          resolve
        }
      });
    }),
  resolveConfirm: (confirmed) => {
    const current = get().confirm;
    if (!current) return;
    current.resolve(confirmed);
    set({ confirm: null });
  }
}));

// Convenience helpers so callers don't have to grab the store.
export const toast = {
  info: (message: string, timeoutMs?: number) => useUiStore.getState().pushToast({ tone: "info", message, timeoutMs }),
  success: (message: string, timeoutMs?: number) => useUiStore.getState().pushToast({ tone: "success", message, timeoutMs }),
  warning: (message: string, timeoutMs?: number) => useUiStore.getState().pushToast({ tone: "warning", message, timeoutMs }),
  danger: (message: string, timeoutMs?: number) => useUiStore.getState().pushToast({ tone: "danger", message, timeoutMs })
};

export function confirmDialog(input: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
}) {
  return useUiStore.getState().requestConfirm(input);
}
