import type { AfterFinalCycleBehavior, SessionMode, SessionTimerSnapshot, TimerPhase } from "../types/timer";
import { formatMinutes } from "../utils/formatTime";

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
    awaitingNextPhase: null,
    completedFocusCycles: 0,
    focusSecondsBanked: 0,
    isExtension: false
  };
}

// Focus seconds elapsed in the *in-progress* focus phase (running or paused),
// clamped to the phase length. Zero outside a focus phase — including once a focus
// phase has completed (isRunning false, awaiting the next phase) so it is never
// double-counted on top of what completeCurrentPhase already banked.
export function liveFocusElapsed(snapshot: SessionTimerSnapshot, now = Date.now()): number {
  if (snapshot.phase === "focus" && snapshot.isRunning) {
    return clamp(snapshot.totalPhaseSeconds - remainingFromTimestamp(snapshot, now), 0, snapshot.totalPhaseSeconds);
  }
  if (snapshot.phase === "paused" && snapshot.previousPhase === "focus") {
    return clamp(snapshot.totalPhaseSeconds - snapshot.remainingSeconds, 0, snapshot.totalPhaseSeconds);
  }
  return 0;
}

/** Authoritative total focus seconds for the session: banked + the live phase. */
export function totalFocusSeconds(snapshot: SessionTimerSnapshot, now = Date.now()): number {
  return snapshot.focusSecondsBanked + liveFocusElapsed(snapshot, now);
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
    awaitingFinalChoice: false,
    awaitingNextPhase: null,
    isExtension: false
  };
}

// When a phase reaches zero we stop the timer and queue the *next* phase in
// `awaitingNextPhase` rather than starting it. The UI then asks the user to
// confirm. The "ask" final-cycle flow keeps its own dedicated buttons via
// `awaitingFinalChoice`.
export function completeCurrentPhase(
  snapshot: SessionTimerSnapshot,
  options: { countFocusCycle?: boolean } = {},
  now = Date.now()
): SessionTimerSnapshot {
  if (!snapshot.activeSessionId) return snapshot;
  // A focus cycle counts as a finished pomodoro only when the phase actually ran
  // its course. Skipping a focus block advances the session but must NOT bank a
  // cycle — otherwise the skipped (mostly-unspent) focus minutes inflate the
  // pomodoro count. The real focus *time* studied is still banked either way.
  // An extension (+N min) focus phase banks its time but is never a new pomodoro —
  // the cycle was already credited when the base focus phase finished.
  const countFocusCycle = (options.countFocusCycle ?? true) && !snapshot.isExtension;
  // Clear the extension flag on the way out: whatever comes next (the break/long-break
  // prompt, the final choice, or a re-extension) starts from a clean slate.
  const stopped = { ...snapshot, remainingSeconds: 0, phaseStartedAt: null, isRunning: false, isExtension: false };

  if (snapshot.phase === "focus") {
    const completed = countFocusCycle ? snapshot.completedFocusCycles + 1 : snapshot.completedFocusCycles;
    const focusSecondsBanked = snapshot.focusSecondsBanked + liveFocusElapsed(snapshot, now);
    const isFinalPlannedCycle = snapshot.sessionMode === "planned" && snapshot.currentCycle >= snapshot.plannedCycles;
    const base = { ...stopped, completedFocusCycles: completed, focusSecondsBanked };
    if (isFinalPlannedCycle) {
      if (snapshot.afterFinalCycleBehavior === "ask") return { ...base, phase: "paused", awaitingFinalChoice: true, awaitingNextPhase: null };
      if (snapshot.afterFinalCycleBehavior === "wrap_up") return { ...base, awaitingNextPhase: "completed" };
      return { ...base, awaitingNextPhase: "long_break" };
    }
    return { ...base, awaitingNextPhase: "break" };
  }

  if (snapshot.phase === "break") {
    return { ...stopped, awaitingNextPhase: "focus" };
  }

  if (snapshot.phase === "long_break") {
    return { ...stopped, awaitingNextPhase: "completed" };
  }

  return snapshot;
}

export function confirmNextPhase(snapshot: SessionTimerSnapshot, now = Date.now()): SessionTimerSnapshot {
  if (!snapshot.awaitingNextPhase) return snapshot;
  const queued = snapshot.awaitingNextPhase;
  if (queued === "break") {
    return startPhase(snapshot, "break", snapshotBreakSeconds(snapshot), now);
  }
  if (queued === "long_break") {
    return startPhase(snapshot, "long_break", snapshot.longBreakMinutes * 60, now);
  }
  if (queued === "focus") {
    return startPhase({ ...snapshot, currentCycle: snapshot.currentCycle + 1 }, "focus", snapshotFocusSeconds(snapshot), now);
  }
  // "completed"
  return { ...snapshot, phase: "completed", isRunning: false, remainingSeconds: 0, phaseStartedAt: null, awaitingFinalChoice: false, awaitingNextPhase: null };
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

export function completeSessionSnapshot(snapshot: SessionTimerSnapshot, now = Date.now()): SessionTimerSnapshot {
  // Bank whatever focus time the in-progress phase has accrued before tearing the
  // timer down, so ending mid-focus (from any window/button) still records it.
  const focusSecondsBanked = snapshot.focusSecondsBanked + liveFocusElapsed(snapshot, now);
  return { ...snapshot, focusSecondsBanked, phase: "completed", isRunning: false, remainingSeconds: 0, phaseStartedAt: null, awaitingFinalChoice: false, awaitingNextPhase: null, isExtension: false };
}

/**
 * Add "+minutes" of focus from a focus-end prompt to keep going in flow. Only valid
 * once a focus phase has just ended (the break / long-break / wrap-up prompt, or the
 * final-cycle choice) — never mid-phase. The extension runs as a normal focus phase
 * flagged isExtension, so its time banks like any focus block, but it does not count
 * as a new pomodoro and, on completion, returns to the same prompt (currentCycle and
 * plannedCycles are untouched, so completeCurrentPhase re-derives the identical state).
 */
export function extendFocus(snapshot: SessionTimerSnapshot, minutes: number, now = Date.now()): SessionTimerSnapshot {
  const atFocusEnd =
    snapshot.awaitingFinalChoice ||
    snapshot.awaitingNextPhase === "break" ||
    snapshot.awaitingNextPhase === "long_break" ||
    snapshot.awaitingNextPhase === "completed";
  if (!snapshot.activeSessionId || !atFocusEnd) return snapshot;
  const seconds = clamp(Math.round(minutes), 1, 120) * 60;
  return {
    ...snapshot,
    phase: "focus",
    previousPhase: null,
    remainingSeconds: seconds,
    totalPhaseSeconds: seconds,
    isRunning: true,
    phaseStartedAt: now,
    pausedAt: null,
    awaitingFinalChoice: false,
    awaitingNextPhase: null,
    isExtension: true
  };
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
  const breakLabel = longBreak ? `${betweenBreaks} min break + ${longBreak} min long break` : `${betweenBreaks} min break`;
  return `${cycles} focus cycles · ${formatMinutes(focusTotal)} focus · ${breakLabel} · about ${formatMinutes(total)} total`;
}
