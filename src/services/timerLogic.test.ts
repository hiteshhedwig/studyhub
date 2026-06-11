import { describe, expect, it } from "vitest";
import {
  completeCurrentPhase,
  completeSessionSnapshot,
  confirmNextPhase,
  continueAnotherCycle,
  createSessionTimer,
  formatSessionPlanSummary,
  pauseSnapshot,
  remainingFromTimestamp,
  resumeSnapshot,
  takeLongBreak,
  totalFocusSeconds
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
    expect(formatSessionPlanSummary(baseInput)).toBe("2 focus cycles · 60m focus · 10 min break · about 70m total");
    expect(formatSessionPlanSummary({ ...baseInput, afterFinalCycleBehavior: "long_break" })).toBe("2 focus cycles · 60m focus · 10 min break + 20 min long break · about 90m total");
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
    const ended = completeCurrentPhase(snapshot);
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

  it("does not bank a focus cycle when the focus phase is skipped", () => {
    const snapshot = createSessionTimer(baseInput);
    // Skip = complete the phase without counting it (how skipPhase calls it).
    const skipped = completeCurrentPhase(snapshot, { countFocusCycle: false });
    expect(skipped.completedFocusCycles).toBe(0); // no inflated pomodoro
    expect(skipped.awaitingNextPhase).toBe("break"); // still advances the session
  });

  it("banks elapsed focus time when a focus phase completes", () => {
    const snapshot = createSessionTimer(baseInput); // 30m focus, started at now=1000
    expect(snapshot.focusSecondsBanked).toBe(0);
    // Complete the focus phase 10 minutes in.
    const ended = completeCurrentPhase(snapshot, {}, 601_000);
    expect(ended.completedFocusCycles).toBe(1);
    expect(ended.focusSecondsBanked).toBe(600);
  });

  it("credits partial focus time when the session is ended mid-pomodoro", () => {
    const snapshot = createSessionTimer(baseInput); // 30m focus, started at now=1000
    // End the whole session 5 minutes into the focus phase (no full cycle).
    const done = completeSessionSnapshot(snapshot, 301_000);
    expect(done.phase).toBe("completed");
    expect(done.completedFocusCycles).toBe(0); // never finished a pomodoro
    expect(done.focusSecondsBanked).toBe(300); // ...but the 5 minutes are still credited
  });

  it("totalFocusSeconds adds the live in-progress focus phase to the banked total", () => {
    const snapshot = createSessionTimer(baseInput);
    // 7 minutes into the first focus phase, nothing banked yet.
    expect(totalFocusSeconds(snapshot, 421_000)).toBe(420);
  });

  it("does not double-count focus time once a phase has completed", () => {
    const ended = completeCurrentPhase(createSessionTimer(baseInput), {}, 601_000);
    // After completion the live phase contributes nothing on top of the banked 600.
    expect(totalFocusSeconds(ended, 700_000)).toBe(600);
  });

  it("registers focus time when work is wrapped up via skip + end", () => {
    const focus = createSessionTimer(baseInput); // 30m focus, started at now=1000
    // Skip 12 minutes in — how the store composes it: complete-without-counting, then advance.
    const afterSkip = confirmNextPhase(completeCurrentPhase(focus, { countFocusCycle: false }, 721_000), 721_000);
    expect(afterSkip.phase).toBe("break"); // skip advanced past focus
    expect(afterSkip.completedFocusCycles).toBe(0); // skip never fakes a completed pomodoro
    expect(afterSkip.focusSecondsBanked).toBe(720); // ...but the 12 minutes studied are banked
    // End the session during the break that follows.
    const done = completeSessionSnapshot(afterSkip, 760_000);
    expect(totalFocusSeconds(done)).toBe(720); // time survives the skip + end
  });

  it("registers focus time when work is wrapped up via pause + end", () => {
    const focus = createSessionTimer(baseInput); // 30m focus, started at now=1000
    const paused = pauseSnapshot(focus, 901_000); // paused 15 minutes in
    expect(paused.phase).toBe("paused");
    const done = completeSessionSnapshot(paused, 950_000);
    expect(totalFocusSeconds(done)).toBe(900); // the 15 minutes are credited
  });

  it("accumulates focus time across a completed cycle plus a skipped partial one", () => {
    const focusOne = createSessionTimer(baseInput);
    const focusOneEnd = completeCurrentPhase(focusOne, {}, 1_801_000); // full 30m cycle
    const breakOne = confirmNextPhase(focusOneEnd, 1_801_000);
    const breakEnd = completeCurrentPhase(breakOne, {}, 2_401_000);
    const focusTwo = confirmNextPhase(breakEnd, 2_401_000);
    // 8 minutes into the second focus block, skip then end.
    const afterSkip = confirmNextPhase(completeCurrentPhase(focusTwo, { countFocusCycle: false }, 2_881_000), 2_881_000);
    const done = completeSessionSnapshot(afterSkip, 2_900_000);
    expect(done.completedFocusCycles).toBe(1); // only the full cycle counts as a pomodoro
    expect(totalFocusSeconds(done)).toBe(1800 + 480); // 30m + 8m of real focus
  });

  it("asks after the final planned cycle, then can continue or take long break", () => {
    const focusOneEnd = completeCurrentPhase(createSessionTimer(baseInput));
    const breakOne = confirmNextPhase(focusOneEnd, 1_802_000);
    const breakOneEnd = completeCurrentPhase(breakOne);
    const focusTwo = confirmNextPhase(breakOneEnd, 2_403_000);
    const focusTwoEnd = completeCurrentPhase(focusTwo);
    expect(focusTwoEnd.awaitingFinalChoice).toBe(true);
    expect(focusTwoEnd.phase).toBe("paused");
    expect(continueAnotherCycle(focusTwoEnd, 4_204_000).currentCycle).toBe(3);
    expect(takeLongBreak(focusTwoEnd, 4_204_000).phase).toBe("long_break");
  });
});
