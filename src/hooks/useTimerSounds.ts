import { useEffect, useRef } from "react";
import type { SessionTimerSnapshot } from "../types/timer";
import { playPhaseEndBell, playPreEndTick } from "../services/soundService";

// Plays a soft tick each second during the last 5s of a running phase and a
// fuller bell the moment a phase ends (awaitingNextPhase becomes set, or the
// "ask" final-choice prompt appears).
export function useTimerSounds(timer: SessionTimerSnapshot) {
  const lastTickKeyRef = useRef<string | null>(null);
  const lastBellKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      timer.isRunning &&
      timer.phaseStartedAt &&
      (timer.phase === "focus" || timer.phase === "break" || timer.phase === "long_break") &&
      timer.remainingSeconds > 0 &&
      timer.remainingSeconds <= 5
    ) {
      const key = `${timer.phaseStartedAt}:${timer.remainingSeconds}`;
      if (lastTickKeyRef.current !== key) {
        lastTickKeyRef.current = key;
        playPreEndTick(key);
      }
    }
  }, [timer.isRunning, timer.phase, timer.phaseStartedAt, timer.remainingSeconds]);

  useEffect(() => {
    const endedAt = timer.awaitingNextPhase || (timer.awaitingFinalChoice ? "ask" : null);
    if (!endedAt) {
      lastBellKeyRef.current = null;
      return;
    }
    // Key includes the phase that just ended so we ring exactly once per ending.
    const key = `${timer.activeSessionId ?? "none"}:${timer.completedFocusCycles}:${timer.phase}:${endedAt}`;
    if (lastBellKeyRef.current !== key) {
      lastBellKeyRef.current = key;
      playPhaseEndBell(key);
    }
  }, [timer.awaitingNextPhase, timer.awaitingFinalChoice, timer.activeSessionId, timer.completedFocusCycles, timer.phase]);
}
