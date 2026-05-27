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
