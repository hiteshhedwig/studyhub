import { describe, expect, it } from "vitest";
import {
  completeCurrentPhase,
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

  it("moves from focus to break between planned cycles", () => {
    const snapshot = createSessionTimer(baseInput);
    const next = completeCurrentPhase(snapshot, 1_801_000);
    expect(next.phase).toBe("break");
    expect(next.remainingSeconds).toBe(600);
    expect(next.currentCycle).toBe(1);
    expect(next.completedFocusCycles).toBe(1);
  });

  it("asks after the final planned cycle, then can continue or take long break", () => {
    const cycleOne = completeCurrentPhase(createSessionTimer(baseInput), 1_801_000);
    const cycleTwo = completeCurrentPhase(completeCurrentPhase(cycleOne, 2_401_000), 4_201_000);
    expect(cycleTwo.awaitingFinalChoice).toBe(true);
    expect(cycleTwo.phase).toBe("paused");
    expect(continueAnotherCycle(cycleTwo, 4_202_000).currentCycle).toBe(3);
    expect(takeLongBreak(cycleTwo, 4_202_000).phase).toBe("long_break");
  });
});
