import { create } from "zustand";
import {
  completeCurrentPhase,
  completeSessionSnapshot,
  confirmNextPhase,
  continueAnotherCycle,
  createSessionTimer,
  extendFocus,
  initialTimerSnapshot,
  pauseSnapshot,
  remainingFromTimestamp,
  resumeSnapshot,
  takeLongBreak,
  type StartTimerInput
} from "../services/timerLogic";
import type { OverlayPreferences, SessionTimerSnapshot } from "../types/timer";

const TIMER_KEY = "study-hub-session-timer";
const PREFS_KEY = "study-hub-overlay-preferences";
const CHANNEL = "study-hub-session-timer-sync";
const TIMER_EVENT = "study-hub://timer-snapshot";
const PREFS_EVENT = "study-hub://overlay-preferences";

const defaultPrefs: OverlayPreferences = {
  isOverlayOpen: false,
  startAutomatically: false,
  alwaysOnTop: true,
  defaultCollapsed: false,
  isCollapsed: false,
  lastPosition: null
};

type BroadcastMessage =
  | { kind: "snapshot"; snapshot: SessionTimerSnapshot; source: string }
  | { kind: "preferences"; preferences: OverlayPreferences; source: string };

type TimerState = SessionTimerSnapshot &
  OverlayPreferences & {
    sourceId: string;
    startTimer: (input: StartTimerInput) => void;
    pauseTimer: () => void;
    resumeTimer: () => void;
    toggleRunning: () => void;
    skipPhase: () => void;
    refreshDisplay: () => void;
    endTimer: () => void;
    confirmNextPhase: () => void;
    continueAnotherCycle: () => void;
    takeLongBreak: () => void;
    extendFocus: (minutes: number) => void;
    setOverlayOpen: (isOpen: boolean) => void;
    setOverlayCollapsed: (isCollapsed: boolean) => void;
    setOverlayPreference: <K extends keyof OverlayPreferences>(key: K, value: OverlayPreferences[K]) => void;
  };

const sourceId = crypto.randomUUID();
let channel: BroadcastChannel | null = null;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeSnapshot(snapshot: SessionTimerSnapshot) {
  localStorage.setItem(TIMER_KEY, JSON.stringify(snapshot));
  channel?.postMessage({ kind: "snapshot", snapshot, source: sourceId } satisfies BroadcastMessage);
  void import("@tauri-apps/api/event")
    .then(({ emit }) => emit(TIMER_EVENT, { snapshot, source: sourceId }))
    .catch(() => undefined);
}

function writePreferences(preferences: OverlayPreferences) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
  channel?.postMessage({ kind: "preferences", preferences, source: sourceId } satisfies BroadcastMessage);
  void import("@tauri-apps/api/event")
    .then(({ emit }) => emit(PREFS_EVENT, { preferences, source: sourceId }))
    .catch(() => undefined);
}

function snapshotFromState(state: TimerState): SessionTimerSnapshot {
  const {
    activeSessionId,
    topicTitle,
    sessionTitle,
    phase,
    previousPhase,
    remainingSeconds,
    totalPhaseSeconds,
    focusSeconds,
    breakSeconds,
    currentCycle,
    totalCycles,
    sessionMode,
    plannedCycles,
    afterFinalCycleBehavior,
    longBreakMinutes,
    isRunning,
    startedAt,
    phaseStartedAt,
    pausedAt,
    awaitingFinalChoice,
    awaitingNextPhase,
    completedFocusCycles,
    focusSecondsBanked,
    isExtension
  } = state;
  return {
    activeSessionId,
    topicTitle,
    sessionTitle,
    phase,
    previousPhase,
    remainingSeconds,
    totalPhaseSeconds,
    focusSeconds,
    breakSeconds,
    currentCycle,
    totalCycles,
    sessionMode,
    plannedCycles,
    afterFinalCycleBehavior,
    longBreakMinutes,
    isRunning,
    startedAt,
    phaseStartedAt,
    pausedAt,
    awaitingFinalChoice,
    awaitingNextPhase,
    completedFocusCycles,
    focusSecondsBanked,
    isExtension
  };
}

function preferencesFromState(state: TimerState): OverlayPreferences {
  return {
    isOverlayOpen: state.isOverlayOpen,
    startAutomatically: state.startAutomatically,
    alwaysOnTop: state.alwaysOnTop,
    defaultCollapsed: state.defaultCollapsed,
    isCollapsed: state.isCollapsed,
    lastPosition: state.lastPosition
  };
}

function setAndPersist(set: (partial: Partial<TimerState>) => void, get: () => TimerState, snapshot: SessionTimerSnapshot) {
  set(snapshot);
  writeSnapshot(snapshot);
}

const storedSnapshot = readJson<SessionTimerSnapshot>(TIMER_KEY, initialTimerSnapshot());
const storedPrefs = readJson<OverlayPreferences>(PREFS_KEY, defaultPrefs);

export const useSessionTimerStore = create<TimerState>((set, get) => ({
  ...storedSnapshot,
  ...storedPrefs,
  sourceId,
  startTimer: (input) => {
    const snapshot = createSessionTimer(input);
    setAndPersist(set, get, snapshot);
  },
  pauseTimer: () => setAndPersist(set, get, pauseSnapshot(snapshotFromState(get()))),
  resumeTimer: () => setAndPersist(set, get, resumeSnapshot(snapshotFromState(get()))),
  toggleRunning: () => {
    const state = get();
    if (state.isRunning) state.pauseTimer();
    else state.resumeTimer();
  },
  refreshDisplay: () => {
    const state = get();
    const snapshot = snapshotFromState(state);
    if (!snapshot.isRunning) return;
    const remainingSeconds = remainingFromTimestamp(snapshot);
    if (remainingSeconds > 0) {
      set({ remainingSeconds });
      writeSnapshot({ ...snapshot, remainingSeconds });
      return;
    }
    setAndPersist(set, get, completeCurrentPhase({ ...snapshot, remainingSeconds: 0 }));
  },
  skipPhase: () => {
    const snapshot = snapshotFromState(get());
    // If already at end-of-phase confirmation, "Skip" just advances.
    if (snapshot.awaitingNextPhase) {
      setAndPersist(set, get, confirmNextPhase(snapshot));
      return;
    }
    const activeSnapshot = snapshot.phase === "paused" && snapshot.previousPhase ? { ...snapshot, phase: snapshot.previousPhase, isRunning: true } : snapshot;
    // Skip jumps straight to the next phase. A skipped focus block does not count
    // as a completed pomodoro, so it never adds to recorded focus hours.
    setAndPersist(set, get, confirmNextPhase(completeCurrentPhase(activeSnapshot, { countFocusCycle: false })));
  },
  endTimer: () => setAndPersist(set, get, completeSessionSnapshot(snapshotFromState(get()))),
  confirmNextPhase: () => setAndPersist(set, get, confirmNextPhase(snapshotFromState(get()))),
  continueAnotherCycle: () => setAndPersist(set, get, continueAnotherCycle(snapshotFromState(get()))),
  takeLongBreak: () => setAndPersist(set, get, takeLongBreak(snapshotFromState(get()))),
  extendFocus: (minutes) => setAndPersist(set, get, extendFocus(snapshotFromState(get()), minutes)),
  setOverlayOpen: (isOpen) => {
    set({ isOverlayOpen: isOpen });
    writePreferences(preferencesFromState(get()));
  },
  setOverlayCollapsed: (isCollapsed) => {
    set({ isCollapsed });
    writePreferences(preferencesFromState(get()));
  },
  setOverlayPreference: (key, value) => {
    set({ [key]: value } as Partial<TimerState>);
    writePreferences(preferencesFromState(get()));
  }
}));

export function initTimerSync() {
  if (!channel && typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event: MessageEvent<BroadcastMessage>) => {
      if (!event.data || event.data.source === sourceId) return;
      if (event.data.kind === "snapshot") useSessionTimerStore.setState(event.data.snapshot);
      if (event.data.kind === "preferences") useSessionTimerStore.setState(event.data.preferences);
    };
  }
  void import("@tauri-apps/api/event")
    .then(({ listen }) => {
      void listen<{ snapshot: SessionTimerSnapshot; source: string }>(TIMER_EVENT, (event) => {
        if (event.payload.source !== sourceId) useSessionTimerStore.setState(event.payload.snapshot);
      });
      void listen<{ preferences: OverlayPreferences; source: string }>(PREFS_EVENT, (event) => {
        if (event.payload.source !== sourceId) useSessionTimerStore.setState(event.payload.preferences);
      });
    })
    .catch(() => undefined);
  window.addEventListener("storage", (event) => {
    if (event.key === TIMER_KEY && event.newValue) useSessionTimerStore.setState(JSON.parse(event.newValue) as SessionTimerSnapshot);
    if (event.key === PREFS_KEY && event.newValue) useSessionTimerStore.setState(JSON.parse(event.newValue) as OverlayPreferences);
  });
}
