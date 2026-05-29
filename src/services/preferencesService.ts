// Small persisted preferences that aren't tied to a particular store.

const POMODORO_KEY = "study-hub-default-pomodoro";

export const POMODORO_PRESETS = [
  { id: "25/5", label: "25 / 5 min", focus: 25, break: 5 },
  { id: "30/10", label: "30 / 10 min", focus: 30, break: 10 },
  { id: "50/10", label: "50 / 10 min", focus: 50, break: 10 }
] as const;

export type PomodoroPresetId = (typeof POMODORO_PRESETS)[number]["id"];

export function getDefaultPomodoro(): { focus: number; break: number } {
  try {
    const raw = localStorage.getItem(POMODORO_KEY);
    const preset = POMODORO_PRESETS.find((item) => item.id === raw) ?? POMODORO_PRESETS[0];
    return { focus: preset.focus, break: preset.break };
  } catch {
    return { focus: 25, break: 5 };
  }
}

export function getDefaultPomodoroId(): PomodoroPresetId {
  try {
    const raw = localStorage.getItem(POMODORO_KEY) as PomodoroPresetId | null;
    return POMODORO_PRESETS.find((item) => item.id === raw)?.id ?? POMODORO_PRESETS[0].id;
  } catch {
    return POMODORO_PRESETS[0].id;
  }
}

export function setDefaultPomodoro(id: PomodoroPresetId) {
  try {
    localStorage.setItem(POMODORO_KEY, id);
  } catch {
    // ignore
  }
}

const PRACTICE_SHORTCUTS_KEY = "study-hub-practice-shortcuts";

/** Whether Space / arrows / 1-4 act as practice shortcuts. Enabled by default. */
export function getPracticeShortcutsEnabled(): boolean {
  try {
    return localStorage.getItem(PRACTICE_SHORTCUTS_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setPracticeShortcutsEnabled(enabled: boolean) {
  try {
    localStorage.setItem(PRACTICE_SHORTCUTS_KEY, enabled ? "on" : "off");
  } catch {
    // ignore
  }
}

const AI_ENABLED_KEY = "study-hub-ai-enabled";
const AI_KEY_KEY = "study-hub-ai-key";
const AI_MODEL_KEY = "study-hub-ai-model";

// Must support structured outputs — OpenRouter ":free" tiers do NOT, so the
// grade JSON can't be parsed. Default to a cheap, fast, schema-capable model.
export const DEFAULT_AI_MODEL = "google/gemini-2.0-flash-001";

export type AiEvalConfig = { enabled: boolean; apiKey: string; model: string };

/**
 * OpenRouter config for AI answer evaluation. Stored in localStorage — the key
 * is plaintext in the WebView store, acceptable for a local single-user app.
 * The feature only activates when explicitly enabled AND a key is present.
 */
export function getAiEvalConfig(): AiEvalConfig {
  try {
    return {
      enabled: localStorage.getItem(AI_ENABLED_KEY) === "on",
      apiKey: localStorage.getItem(AI_KEY_KEY) ?? "",
      model: localStorage.getItem(AI_MODEL_KEY) || DEFAULT_AI_MODEL
    };
  } catch {
    return { enabled: false, apiKey: "", model: DEFAULT_AI_MODEL };
  }
}

export function setAiEvalEnabled(enabled: boolean) {
  try {
    localStorage.setItem(AI_ENABLED_KEY, enabled ? "on" : "off");
  } catch {
    // ignore
  }
}

export function setAiApiKey(key: string) {
  try {
    localStorage.setItem(AI_KEY_KEY, key.trim());
  } catch {
    // ignore
  }
}

export function setAiModel(model: string) {
  try {
    localStorage.setItem(AI_MODEL_KEY, model.trim() || DEFAULT_AI_MODEL);
  } catch {
    // ignore
  }
}
