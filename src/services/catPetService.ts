import { WebviewWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/tauri";

const CAT_LABEL = "cat-pet";

/**
 * Open the desktop-cat overlay: a frameless, transparent, always-on-top window
 * that covers the screen and lets every click pass through to the apps beneath
 * (the cat reacts to the cursor via a Rust global-cursor feed, never via the DOM,
 * so it never needs to receive clicks). Re-opening just reveals the existing one.
 */
export async function openCatPet(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const existing = WebviewWindow.getByLabel(CAT_LABEL);
    if (existing) {
      await existing.show();
      await invoke("start_pet_tracking");
      return { ok: true as const };
    }

    const cat = new WebviewWindow(CAT_LABEL, {
      url: "/#/catpet",
      title: "Study Buddy",
      decorations: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focus: false,
      visible: true,
      // Sized/positioned to the active monitor by the window itself on mount.
      width: 400,
      height: 300
    });

    return await new Promise((resolve) => {
      cat.once("tauri://created", () => {
        void invoke("start_pet_tracking");
        resolve({ ok: true });
      });
      cat.once("tauri://error", (event) => {
        resolve({ ok: false, error: typeof event.payload === "string" ? event.payload : "The desktop cat could not be opened." });
      });
    });
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "The desktop cat could not be opened." };
  }
}

/** Close the cat overlay and stop the cursor feed. */
export async function closeCatPet(): Promise<void> {
  try {
    await invoke("stop_pet_tracking");
  } catch {
    // ignore — the command only exists in the Tauri build
  }
  const cat = WebviewWindow.getByLabel(CAT_LABEL);
  if (cat) await cat.close();
}

export function isCatPetOpen(): boolean {
  return Boolean(WebviewWindow.getByLabel(CAT_LABEL));
}
