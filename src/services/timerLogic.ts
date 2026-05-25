import type { AfterFinalCycleBehavior, SessionMode, SessionTimerSnapshot, TimerPhase } from "../types/timer";

export type StartTimerInput = {
  activeSessionId: string;
  topicTitle: string;
  sessionTitle: string;
  focusMinutes: number;
  breakMinutes: number;
  sessionMode: SessionMode;
  plannedCycles: number;
  afterFinalCycleBehavior: AfterFinalCycleBehavior;
  longBreakMinutes: number;
  now?: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function initialTimerSnapshot(now = Date.now()): SessionTimerSnapshot {
  return {
    activeSessionId: null,
    topicTitle: "",
    sessionTitle: "",
    phase: "idle",
    previousPhase: null,
    remainingSeconds: 0,
    totalPhaseSeconds: 0,
    focusSeconds: 25 * 60,
    breakSeconds: 5 * 60,
    currentCycle: 0,
    totalCycles: null,
    sessionMode: "planned",
    plannedCycles: 2,
    afterFinalCycleBehavior: "ask",
    longBreakMinutes: 20,
    isRunning: false,
    startedAt: now,
    phaseStartedAt: null,
    pausedAt: null,
    awaitingFinalChoice: false,
    completedFocusCycles: 0
  };
}

export function createSessionTimer(input: StartTimerInput): SessionTimerSnapshot {
  const now = input.now ?? Date.now();
  const focusSeconds = Math.max(1, input.focusMinutes) * 60;
  const plannedCycles = clamp(input.plannedCycles, 1, 12);
  return {
    ...initialTimerSnapshot(now),
    activeSessionId: input.activeSessionId,
    topicTitle: input.topicTitle,
    sessionTitle: input.sessionTitle,
    phase: "focus",
    remainingSeconds: focusSeconds,
    totalPhaseSeconds: focusSeconds,
    focusSeconds,
    breakSeconds: Math.max(1, input.breakMinutes) * 60,
    currentCycle: 1,
    totalCycles: input.sessionMode === "planned" ? plannedCycles : null,
    sessionMode: input.sessionMode,
    plannedCycles,
    afterFinalCycleBehavior: input.afterFinalCycleBehavior,
    longBreakMinutes: clamp(input.longBreakMinutes, 1, 120),
    isRunning: true,
    phaseStartedAt: now
  };
}

export function remainingFromTimestamp(snapshot: SessionTimerSnapshot, now = Date.now()) {
  if (!snapshot.isRunning || !snapshot.phaseStartedAt || snapshot.phase === "idle" || snapshot.phase === "completed" || snapshot.phase === "paused") {
    return snapshot.remainingSeconds;
  }
  const elapsed = Math.floor((now - snapshot.phaseStartedAt) / 1000);
  return Math.max(0, snapshot.totalPhaseSeconds - elapsed);
}

export function progressPercent(snapshot: SessionTimerSnapshot, now = Date.now()) {
  if (snapshot.totalPhaseSeconds <= 0) return 0;
  const remaining = remainingFromTimestamp(snapshot, now);
  return clamp(((snapshot.totalPhaseSeconds - remaining) / snapshot.totalPhaseSeconds) * 100, 0, 100);
}

export function pauseSnapshot(snapshot: SessionTimerSnapshot, now = Date.now()): SessionTimerSnapshot {
  if (!snapshot.isRunning || snapshot.phase === "idle" || snapshot.phase === "completed" || snapshot.phase === "paused") return snapshot;
  return {
    ...snapshot,
    previousPhase: snapshot.phase,
    phase: "paused",
    remainingSeconds: remainingFromTimestamp(snapshot, now),
    isRunning: false,
    pausedAt: now,
    phaseStartedAt: null
  };
}

export function resumeSnapshot(snapshot: SessionTimerSnapshot, now = Date.now()): SessionTimerSnapshot {
  if (snapshot.phase !== "paused" || !snapshot.previousPhase || snapshot.remainingSeconds <= 0) return snapshot;
  return {
    ...snapshot,
    phase: snapshot.previousPhase,
    previousPhase: null,
    isRunning: true,
    pausedAt: null,
    phaseStartedAt: now - (snapshot.totalPhaseSeconds - snapshot.remainingSeconds) * 1000
  };
}

function startPhase(snapshot: SessionTimerSnapshot, phase: TimerPhase, seconds: number, now: number): SessionTimerSnapshot {
  return {
    ...snapshot,
    phase,
    previousPhase: null,
    remainingSeconds: seconds,
    totalPhaseSeconds: seconds,
    isRunning: true,
    phaseStartedAt: now,
    pausedAt: null,
    awaitingFinalChoice: false
  };
}

export function completeCurrentPhase(snapshot: SessionTimerSnapshot, now = Date.now()): SessionTimerSnapshot {
  if (!snapshot.activeSessionId) return snapshot;
  if (snapshot.phase === "focus") {
    const completed = snapshot.completedFocusCycles + 1;
    const isFinalPlannedCycle = snapshot.sessionMode === "planned" && snapshot.currentCycle >= snapshot.plannedCycles;
    const base = { ...snapshot, completedFocusCycles: completed, remainingSeconds: 0, phaseStartedAt: null, isRunning: false };
    if (isFinalPlannedCycle) {
      if (snapshot.afterFinalCycleBehavior === "ask") return { ...base, phase: "paused", awaitingFinalChoice: true };
      if (snapshot.afterFinalCycleBehavior === "wrap_up") return { ...base, phase: "completed", awaitingFinalChoice: false };
      return startPhase(base, "long_break", snapshot.longBreakMinutes * 60, now);
    }
    return startPhase(base, "break", snapshotBreakSeconds(snapshot), now);
  }

  if (snapshot.phase === "break") {
    return startPhase({ ...snapshot, currentCycle: snapshot.currentCycle + 1 }, "focus", snapshotFocusSeconds(snapshot), now);
  }

  if (snapshot.phase === "long_break") {
    return { ...snapshot, phase: "completed", remainingSeconds: 0, isRunning: false, phaseStartedAt: null, awaitingFinalChoice: false };
  }

  return snapshot;
}

export function continueAnotherCycle(snapshot: SessionTimerSnapshot, now = Date.now()): SessionTimerSnapshot {
  const nextCycle = snapshot.currentCycle + 1;
  return startPhase(
    {
      ...snapshot,
      currentCycle: nextCycle,
      plannedCycles: Math.max(snapshot.plannedCycles, nextCycle),
      totalCycles: snapshot.sessionMode === "planned" ? Math.max(snapshot.plannedCycles, nextCycle) : null
    },
    "focus",
    snapshotFocusSeconds(snapshot),
    now
  );
}

export function takeLongBreak(snapshot: SessionTimerSnapshot, now = Date.now()): SessionTimerSnapshot {
  return startPhase(snapshot, "long_break", snapshot.longBreakMinutes * 60, now);
}

export function completeSessionSnapshot(snapshot: SessionTimerSnapshot): SessionTimerSnapshot {
  return { ...snapshot, phase: "completed", isRunning: false, remainingSeconds: 0, phaseStartedAt: null, awaitingFinalChoice: false };
}

export function snapshotFocusSeconds(snapshot: SessionTimerSnapshot) {
  return snapshot.focusSeconds || 25 * 60;
}

export function snapshotBreakSeconds(snapshot: SessionTimerSnapshot) {
  return snapshot.breakSeconds || 5 * 60;
}

export function formatSessionPlanSummary(input: {
  sessionMode: SessionMode;
  plannedCycles: number;
  focusMinutes: number;
  breakMinutes: number;
  afterFinalCycleBehavior: AfterFinalCycleBehavior;
  longBreakMinutes: number;
}) {
  if (input.sessionMode === "open_ended") {
    return `Open-ended · ${input.focusMinutes} min focus cycles · ${input.breakMinutes} min breaks between cycles`;
  }
  const cycles = clamp(input.plannedCycles, 1, 12);
  const focusTotal = cycles * input.focusMinutes;
  const betweenBreaks = Math.max(0, cycles - 1) * input.breakMinutes;
  const longBreak = input.afterFinalCycleBehavior === "long_break" ? input.longBreakMinutes : 0;
  const total = focusTotal + betweenBreaks + longBreak;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const totalLabel = hours ? `${hours}h${minutes ? ` ${minutes}m` : ""}` : `${minutes}m`;
  const breakLabel = longBreak ? `${betweenBreaks} min break + ${longBreak} min long break` : `${betweenBreaks} min break`;
  return `${cycles} focus cycles · ${focusTotal} min focus · ${breakLabel} · about ${totalLabel} total`;
}
