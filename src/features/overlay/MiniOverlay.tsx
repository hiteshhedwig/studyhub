import { useEffect } from "react";
import { appWindow, WebviewWindow } from "@tauri-apps/api/window";
import { rememberMiniOverlayPosition, resizeMiniOverlay } from "../../services/overlayWindowService";
import { useSessionTimerStore } from "../../store/sessionTimerStore";
import { progressPercent } from "../../services/timerLogic";
import { unlockAudio } from "../../services/soundService";
import { useTimerSounds } from "../../hooks/useTimerSounds";
import { MiniOverlayControls } from "./MiniOverlayControls";
import { RollingTime } from "../../components/ui/RollingTime";
import "./miniOverlay.css";

function formatTime(seconds: number) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const rest = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function phaseLabel(phase: string, awaitingFinalChoice: boolean, awaitingNextPhase: string | null) {
  if (awaitingFinalChoice) return "Cycle complete";
  if (awaitingNextPhase === "break" || awaitingNextPhase === "long_break") return "Focus done";
  if (awaitingNextPhase === "focus") return "Break done";
  if (awaitingNextPhase === "completed") return "Session done";
  if (phase === "long_break") return "Long Break";
  return phase.replace("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function nextActionLabel(next: string) {
  if (next === "break") return "Start break";
  if (next === "long_break") return "Start long break";
  if (next === "focus") return "Start next cycle";
  return "Finish";
}

export function MiniOverlay() {
  const timer = useSessionTimerStore();
  const progress = progressPercent(timer);

  useEffect(() => {
    const id = window.setInterval(() => timer.refreshDisplay(), 500);
    return () => window.clearInterval(id);
  }, [timer]);

  useTimerSounds(timer);

  useEffect(() => {
    const handler = () => {
      unlockAudio();
      window.removeEventListener("pointerdown", handler);
    };
    window.addEventListener("pointerdown", handler, { once: true });
    return () => window.removeEventListener("pointerdown", handler);
  }, []);

  useEffect(() => {
    const unlisten = appWindow.onMoved(() => {
      void rememberMiniOverlayPosition();
    });
    return () => {
      void unlisten.then((cleanup) => cleanup());
    };
  }, []);

  useEffect(() => {
    const unlisten = appWindow.onCloseRequested(() => {
      timer.setOverlayOpen(false);
      void rememberMiniOverlayPosition();
    });
    return () => {
      void unlisten.then((cleanup) => cleanup());
    };
  }, [timer]);

  useEffect(() => {
    document.body.classList.add("overlay-body");
    const media = window.matchMedia("(prefers-color-scheme: light)");
    function apply() {
      const theme = localStorage.getItem("study-hub-theme") ?? "warm-dark";
      const resolved = theme === "system" ? (media.matches ? "soft-light" : "warm-dark") : theme;
      document.documentElement.dataset.theme = resolved;
    }
    apply();
    function onStorage(event: StorageEvent) {
      if (event.key === "study-hub-theme") apply();
    }
    window.addEventListener("storage", onStorage);
    media.addEventListener("change", apply);
    return () => {
      window.removeEventListener("storage", onStorage);
      media.removeEventListener("change", apply);
    };
  }, []);

  async function closeOverlay() {
    timer.setOverlayOpen(false);
    await rememberMiniOverlayPosition();
    await appWindow.close();
  }

  async function toggleCollapsed() {
    const next = !timer.isCollapsed;
    timer.setOverlayCollapsed(next);
    await resizeMiniOverlay(next);
  }

  async function openMainWindow() {
    const main = WebviewWindow.getByLabel("main");
    await main?.show();
    await main?.setFocus();
  }

  async function startDragging() {
    try {
      await appWindow.startDragging();
    } catch {
      // Browser preview cannot drag native Tauri windows.
    }
  }

  if (!timer.activeSessionId || timer.phase === "idle") {
    return (
      <div className="mini-overlay expanded">
        <button className="overlay-close" aria-label="Close Mini Overlay" onClick={closeOverlay}>
          ×
        </button>
        <div className="overlay-idle" onMouseDown={startDragging}>
          <strong>No active study session</strong>
          <span>Start one from Study Hub.</span>
        </div>
      </div>
    );
  }

  if (timer.isCollapsed) {
    return (
      <div className="mini-overlay collapsed">
        <button className="overlay-collapsed-content" type="button" onClick={toggleCollapsed}>
          <span className={`phase-dot ${timer.phase}`} aria-hidden="true" />
          <span>{phaseLabel(timer.phase, timer.awaitingFinalChoice, timer.awaitingNextPhase)}</span>
          <strong>{formatTime(timer.remainingSeconds)}</strong>
          <span>{timer.totalCycles ? `${timer.currentCycle}/${timer.totalCycles}` : `${timer.currentCycle}`}</span>
        </button>
        <span className="overlay-grip" aria-hidden="true" onMouseDown={startDragging} />
      </div>
    );
  }

  return (
    <div className="mini-overlay expanded">
      <div className="overlay-topline" onMouseDown={startDragging}>
        <div>
          <span>{timer.topicTitle || "Study Hub"}</span>
          <strong>{timer.sessionTitle || "Focused study"}</strong>
        </div>
        <MiniOverlayControls
          collapsed={timer.isCollapsed}
          onCollapse={toggleCollapsed}
          onClose={closeOverlay}
        />
      </div>

      {timer.phase === "completed" ? (
        <div className="overlay-complete">
          <strong>Session complete</strong>
          <span>Nice work. Return to Study Hub to save your reflection.</span>
          <button type="button" onClick={openMainWindow}>
            Open Study Hub
          </button>
        </div>
      ) : (
        <>
          <div className="overlay-main">
            <div className="overlay-phase-row">
              <span className={`phase-dot ${timer.phase}`} aria-hidden="true" />
              <span className="overlay-phase">{phaseLabel(timer.phase, timer.awaitingFinalChoice, timer.awaitingNextPhase)}</span>
              <span className="overlay-cycle-mini">{timer.totalCycles ? `${timer.currentCycle}/${timer.totalCycles}` : `Cycle ${timer.currentCycle}`}</span>
            </div>
            <strong className="overlay-time"><RollingTime time={formatTime(timer.remainingSeconds)} /></strong>
          </div>
          <div className="overlay-progress" aria-label="Timer progress">
            <span style={{ width: `${progress}%` }} />
          </div>
          {timer.awaitingFinalChoice ? (
            <div className="overlay-final-actions">
              <button type="button" onClick={timer.continueAnotherCycle}>Continue</button>
              <button type="button" onClick={timer.takeLongBreak}>Long break</button>
              <button type="button" onClick={timer.endTimer}>Wrap up</button>
            </div>
          ) : timer.awaitingNextPhase ? (
            <div className="overlay-final-actions">
              <button type="button" onClick={timer.confirmNextPhase}>{nextActionLabel(timer.awaitingNextPhase)}</button>
              <button type="button" onClick={timer.endTimer}>Wrap up</button>
            </div>
          ) : (
            <div className="overlay-actions">
              <button type="button" className="overlay-primary" onClick={timer.toggleRunning}>{timer.isRunning ? "Pause" : "Resume"}</button>
              <button type="button" onClick={timer.skipPhase}>Skip</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
