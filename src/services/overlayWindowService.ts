import { LogicalSize, WebviewWindow } from "@tauri-apps/api/window";
import { useSessionTimerStore } from "../store/sessionTimerStore";

const OVERLAY_LABEL = "mini-overlay";
const EXPANDED_SIZE = { width: 320, height: 190 };
const COLLAPSED_SIZE = { width: 220, height: 72 };

export async function openMiniOverlay() {
  try {
    const prefs = useSessionTimerStore.getState();
    const existing = WebviewWindow.getByLabel(OVERLAY_LABEL);
    if (existing) {
      await existing.show();
      await existing.setAlwaysOnTop(prefs.alwaysOnTop);
      await existing.setSize(new LogicalSize(prefs.isCollapsed ? COLLAPSED_SIZE.width : EXPANDED_SIZE.width, prefs.isCollapsed ? COLLAPSED_SIZE.height : EXPANDED_SIZE.height));
      prefs.setOverlayOpen(true);
      return { ok: true as const };
    }

    const size = prefs.defaultCollapsed || prefs.isCollapsed ? COLLAPSED_SIZE : EXPANDED_SIZE;
    const overlay = new WebviewWindow(OVERLAY_LABEL, {
      url: "/#/overlay",
      title: "Mini Overlay",
      width: size.width,
      height: size.height,
      minWidth: COLLAPSED_SIZE.width,
      minHeight: COLLAPSED_SIZE.height,
      decorations: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: prefs.alwaysOnTop,
      visible: true,
      focus: false,
      x: prefs.lastPosition?.x,
      y: prefs.lastPosition?.y
    });

    return await new Promise<{ ok: true } | { ok: false; error: string }>((resolve) => {
      overlay.once("tauri://created", () => {
        useSessionTimerStore.getState().setOverlayOpen(true);
        if (prefs.defaultCollapsed) useSessionTimerStore.getState().setOverlayCollapsed(true);
        resolve({ ok: true });
      });
      overlay.once("tauri://error", (event) => {
        useSessionTimerStore.getState().setOverlayOpen(false);
        resolve({ ok: false, error: typeof event.payload === "string" ? event.payload : "The Mini Overlay could not be opened." });
      });
    });
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "The Mini Overlay could not be opened." };
  }
}

export async function closeMiniOverlay() {
  const overlay = WebviewWindow.getByLabel(OVERLAY_LABEL);
  if (overlay) await overlay.close();
  useSessionTimerStore.getState().setOverlayOpen(false);
}

export async function resizeMiniOverlay(collapsed: boolean) {
  const overlay = WebviewWindow.getByLabel(OVERLAY_LABEL);
  if (!overlay) return;
  const size = collapsed ? COLLAPSED_SIZE : EXPANDED_SIZE;
  await overlay.setSize(new LogicalSize(size.width, size.height));
}

export async function rememberMiniOverlayPosition() {
  const overlay = WebviewWindow.getByLabel(OVERLAY_LABEL);
  if (!overlay) return;
  const position = await overlay.outerPosition();
  useSessionTimerStore.getState().setOverlayPreference("lastPosition", { x: position.x, y: position.y });
}
