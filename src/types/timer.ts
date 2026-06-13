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
  awaitingNextPhase: "break" | "focus" | "long_break" | "completed" | null;
  completedFocusCycles: number;
  // Real focus wall-clock seconds banked from focus phases already left behind
  // (completed, skipped, or ended). The in-progress focus phase is added live on
  // top of this — see totalFocusSeconds — so ending mid-pomodoro still credits the
  // time actually studied, regardless of which button ends the session.
  focusSecondsBanked: number;
  // True while the current focus phase is a "+N min" extension started from a
  // focus-end prompt. Its time is banked like any focus phase, but it does NOT
  // count as a new completed pomodoro (the cycle was already credited), and when
  // it ends it returns to the same prompt so you can extend again, break, or wrap up.
  isExtension: boolean;
};

export type OverlayPreferences = {
  isOverlayOpen: boolean;
  startAutomatically: boolean;
  alwaysOnTop: boolean;
  defaultCollapsed: boolean;
  isCollapsed: boolean;
  lastPosition: { x: number; y: number } | null;
};
