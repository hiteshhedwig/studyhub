export type TimerPhase = "focus" | "break" | "long_break" | "paused" | "idle" | "completed";
export type SessionMode = "planned" | "open_ended";
export type AfterFinalCycleBehavior = "ask" | "wrap_up" | "long_break";

export type SessionTimerSnapshot = {
  activeSessionId: string | null;
  topicTitle: string;
  sessionTitle: string;
  phase: TimerPhase;
  previousPhase: Exclude<TimerPhase, "paused"> | null;
  remainingSeconds: number;
  totalPhaseSeconds: number;
  focusSeconds: number;
  breakSeconds: number;
  currentCycle: number;
  totalCycles: number | null;
  sessionMode: SessionMode;
  plannedCycles: number;
  afterFinalCycleBehavior: AfterFinalCycleBehavior;
  longBreakMinutes: number;
  isRunning: boolean;
  startedAt: number | null;
  phaseStartedAt: number | null;
  pausedAt: number | null;
  awaitingFinalChoice: boolean;
  completedFocusCycles: number;
};

export type OverlayPreferences = {
  isOverlayOpen: boolean;
  startAutomatically: boolean;
  alwaysOnTop: boolean;
  defaultCollapsed: boolean;
  isCollapsed: boolean;
  lastPosition: { x: number; y: number } | null;
};
