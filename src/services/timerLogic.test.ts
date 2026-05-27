import { describe, expect, it } from "vitest";
import {
  completeCurrentPhase,
  confirmNextPhase,
  continueAnotherCycle,
  createSessionTimer,
  formatSessionPlanSummary,
  pauseSnapshot,
  remainingFromTimestamp,
  resumeSnapshot,
  takeLongBreak
} from "./timerLogic";

const baseInput = {
  activeSessionId: "session-1",
  topicTitle: "Machine Learning",
  sessionTitle: "Decision Trees Review",
  focusMinutes: 30,
  breakMinutes: 10,
  sessionMode: "planned" as const,
  plannedCycles: 2,
  afterFinalCycleBehavior: "ask" as const,
  longBreakMinutes: 20,
  now: 1_000
};

describe("timer logic", () => {
  it("computes planned session summaries without final break unless selected", () => {
    expect(formatSessionPlanSummary(baseInput)).toBe("2 focus cycles · 60 min focus · 10 min break · about 1h 10m total");
    expect(formatSessionPlanSummary({ ...baseInput, afterFinalCycleBehavior: "long_break" })).toBe("2 focus cycles · 60 min focus · 10 min break + 20 min long break · about 1h 30m total");
  });

  it("derives remaining time from timestamps", () => {
    const snapshot = createSessionTimer(baseInput);
    expect(remainingFromTimestamp(snapshot, 31_000)).toBe(1770);
  });

  it("pauses and resumes without losing elapsed time", () => {
    const snapshot = createSessionTimer(baseInput);
    const paused = pauseSnapshot(snapshot, 61_000);
    expect(paused.phase).toBe("paused");
    expect(paused.remainingSeconds).toBe(1740);
    const resumed = resumeSnapshot(paused, 121_000);
    expect(resumed.phase).toBe("focus");
    expect(remainingFromTimestamp(resumed, 151_000)).toBe(1710);
  });

  it("queues the break after focus and starts it on confirmation", () => {
    const snapshot = createSessionTimer(baseInput);
    const ended = completeCurrentPhase(snapshot, 1_801_000);
    expect(ended.phase).toBe("focus");
    expect(ended.isRunning).toBe(false);
    expect(ended.awaitingNextPhase).toBe("break");
    expect(ended.completedFocusCycles).toBe(1);

    const started = confirmNextPhase(ended, 1_810_000);
    expect(started.phase).toBe("break");
    expect(started.remainingSeconds).toBe(600);
    expect(started.currentCycle).toBe(1);
    expect(started.isRunning).toBe(true);
    expect(started.awaitingNextPhase).toBeNull();
  });

  it("asks after the final planned cycle, then can continue or take long break", () => {
    const focusOneEnd = completeCurrentPhase(createSessionTimer(baseInput), 1_801_000);
    const breakOne = confirmNextPhase(focusOneEnd, 1_802_000);
    const breakOneEnd = completeCurrentPhase(breakOne, 2_402_000);
    const focusTwo = confirmNextPhase(breakOneEnd, 2_403_000);
    const focusTwoEnd = completeCurrentPhase(focusTwo, 4_203_000);
    expect(focusTwoEnd.awaitingFinalChoice).toBe(true);
    expect(focusTwoEnd.phase).toBe("paused");
    expect(continueAnotherCycle(focusTwoEnd, 4_204_000).currentCycle).toBe(3);
    expect(takeLongBreak(focusTwoEnd, 4_204_000).phase).toBe("long_break");
  });
});
