import { availableMonitors, LogicalSize, WebviewWindow } from "@tauri-apps/api/window";
import { useSessionTimerStore } from "../store/sessionTimerStore";

const OVERLAY_LABEL = "mini-overlay";
const EXPANDED_SIZE = { width: 328, height: 224 };
const COLLAPSED_SIZE = { width: 224, height: 76 };

// A small margin so a chromeless overlay can't be restored flush against (or past)
// a monitor edge where it's effectively unreachable.
const EDGE_MARGIN = 8;
const MIN_VISIBLE = 40;

// Is a *logical* top-left point inside any connected monitor's visible area?
// Monitor bounds come back in physical pixels, so we divide by each monitor's own
// scale factor to compare in the same logical space the saved position is stored in.
// Returns false when monitors can't be read (e.g. non-Tauri preview) so we fall back
// to centering rather than trusting a possibly-stale coordinate.
async function isPointVisible(x: number, y: number): Promise<boolean> {
  try {
    const monitors = await availableMonitors();
    if (!monitors.length) return false;
    return monitors.some((monitor) => {
      const left = monitor.position.x / monitor.scaleFactor;
      const top = monitor.position.y / monitor.scaleFactor;
      const right = left + monitor.size.width / monitor.scaleFactor;
      const bottom = top + monitor.size.height / monitor.scaleFactor;
      return x >= left - EDGE_MARGIN && y >= top - EDGE_MARGIN && x <= right - MIN_VISIBLE && y <= bottom - MIN_VISIBLE;
    });
  } catch {
    return false;
  }
}

export async function openMiniOverlay() {
  try {
    const prefs = useSessionTimerStore.getState();
    // Only trust a saved position if it still lands on a connected monitor. This
    // guards against an overlay stranded off-screen — the classic symptom of the
    // earlier physical/logical unit mismatch on scaled (Windows) displays.
    const savedPosition = prefs.lastPosition && (await isPointVisible(prefs.lastPosition.x, prefs.lastPosition.y)) ? prefs.lastPosition : null;

    const existing = WebviewWindow.getByLabel(OVERLAY_LABEL);
    if (existing) {
      await existing.show();
      await existing.setAlwaysOnTop(prefs.alwaysOnTop);
      await existing.setSize(new LogicalSize(prefs.isCollapsed ? COLLAPSED_SIZE.width : EXPANDED_SIZE.width, prefs.isCollapsed ? COLLAPSED_SIZE.height : EXPANDED_SIZE.height));
      // Self-heal: if the live window has drifted off-screen, pull it back into view.
      try {
        const scale = await existing.scaleFactor();
        const logical = (await existing.outerPosition()).toLogical(scale);
        if (!(await isPointVisible(logical.x, logical.y))) await existing.center();
      } catch {
        // Position read can fail outside a real Tauri window — leave it as-is.
      }
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
      // Restore the saved spot only when it's on-screen; otherwise let Tauri center it.
      center: savedPosition === null,
      x: savedPosition?.x,
      y: savedPosition?.y
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
  // Store in *logical* pixels. outerPosition() is physical, but the position is
  // restored via WindowOptions.x/y, which Tauri reads as logical — saving physical
  // would drift the window by the display's scale factor on every reopen (the
  // off-screen-on-Windows bug). Converting here keeps both sides in one unit.
  const scale = await overlay.scaleFactor();
  const logical = (await overlay.outerPosition()).toLogical(scale);
  useSessionTimerStore.getState().setOverlayPreference("lastPosition", { x: Math.round(logical.x), y: Math.round(logical.y) });
}
