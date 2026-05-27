import { useEffect, useState } from "react";
import { format, isToday, parseISO } from "date-fns";
import { Layers2, Paperclip, Play, Square } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { TimerRing } from "../../components/ui/TimerRing";
import { useAppStore } from "../../store/appStore";
import { useSessionTimerStore } from "../../store/sessionTimerStore";
import { inferFileType, pickLocalFile, readTextFile } from "../../services/fileStorage";
import { parseQuestionImport } from "../../services/importQuestions";
import { formatSessionPlanSummary } from "../../services/timerLogic";
import { openMiniOverlay } from "../../services/overlayWindowService";
import { unlockAudio } from "../../services/soundService";
import { useTimerSounds } from "../../hooks/useTimerSounds";
import type { AfterFinalCycleBehavior, SessionMode } from "../../types/timer";

const presets = [
  { label: "25 / 5", focus: 25, break: 5 },
  { label: "30 / 10", focus: 30, break: 10 },
  { label: "50 / 10", focus: 50, break: 10 }
];

function statusLabel(timer: { phase: string; awaitingFinalChoice: boolean; awaitingNextPhase: string | null }) {
  if (timer.awaitingFinalChoice) return "Cycle complete";
  if (timer.awaitingNextPhase === "break") return "Focus done";
  if (timer.awaitingNextPhase === "long_break") return "Focus done";
  if (timer.awaitingNextPhase === "focus") return "Break done";
  if (timer.awaitingNextPhase === "completed") return "Session done";
  if (timer.phase === "long_break") return "Long Break";
  return timer.phase[0].toUpperCase() + timer.phase.slice(1);
}

function nextPhaseHeading(next: "break" | "focus" | "long_break" | "completed", endedPhase: string) {
  if (next === "break") return "Focus done — ready for a break?";
  if (next === "long_break") return "Focus done — ready for a long break?";
  if (next === "focus") return endedPhase === "long_break" ? "Long break done — ready to focus?" : "Break done — ready to focus?";
  return "Session complete";
}

function nextPhaseHint(next: "break" | "focus" | "long_break" | "completed") {
  if (next === "break" || next === "long_break") return "Take a breath. The break starts when you say so.";
  if (next === "focus") return "The next focus cycle starts when you say so.";
  return "Wrap up the session to save your reflection.";
}

function nextPhaseActionLabel(next: "break" | "focus" | "long_break" | "completed") {
  if (next === "break") return "Start break";
  if (next === "long_break") return "Start long break";
  if (next === "focus") return "Start next cycle";
  return "Finish session";
}

export function TodayPage() {
  const store = useAppStore();
  const timer = useSessionTimerStore();
  const [title, setTitle] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [topicTitle, setTopicTitle] = useState("");
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [focus, setFocus] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [sessionMode, setSessionMode] = useState<SessionMode>("planned");
  const [plannedCycles, setPlannedCycles] = useState(2);
  const [afterFinalCycleBehavior, setAfterFinalCycleBehavior] = useState<AfterFinalCycleBehavior>("ask");
  const [longBreakMinutes, setLongBreakMinutes] = useState(20);
  const [notes, setNotes] = useState("");
  const [reflection, setReflection] = useState("");
  const [understanding, setUnderstanding] = useState(3);
  const [difficulty, setDifficulty] = useState(3);
  const [chatgptLink, setChatgptLink] = useState("");
  const [schedule, setSchedule] = useState(true);
  const [recordedCycles, setRecordedCycles] = useState(timer.completedFocusCycles);
  const [importError, setImportError] = useState("");
  const [overlayError, setOverlayError] = useState("");
  const [materialMessage, setMaterialMessage] = useState("");

  const todaySessions = store.sessions.filter((session) => isToday(parseISO(session.started_at)));
  const dueRevisions = store.revisions.filter((revision) => revision.status === "pending" && isToday(parseISO(revision.due_at)));
  const dueQuestions = store.questions.filter((question) => isToday(parseISO(question.next_due_at)) || parseISO(question.next_due_at) < new Date());
  const todayMinutes = todaySessions.reduce((sum, session) => sum + session.focus_minutes * session.pomodoros_completed, 0);
  const pomodoros = todaySessions.reduce((sum, session) => sum + session.pomodoros_completed, 0);
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
    setRecordedCycles(timer.completedFocusCycles);
  }, [timer.activeSessionId]);

  useEffect(() => {
    if (!store.activeSession || timer.activeSessionId !== store.activeSession.id) return;
    if (timer.completedFocusCycles > recordedCycles) {
      const diff = timer.completedFocusCycles - recordedCycles;
      setRecordedCycles(timer.completedFocusCycles);
      for (let count = 0; count < diff; count += 1) {
        void store.completePomodoro(store.activeSession.id, store.activeSession.focus_minutes, store.activeSession.break_minutes);
      }
    }
  }, [recordedCycles, store, timer.activeSessionId, timer.completedFocusCycles]);

  async function handleStart() {
    let topicId = selectedTopicId;
    let resolvedTopicTitle = store.topics.find((topic) => topic.id === selectedTopicId)?.title ?? topicTitle;
    if (!topicId) {
      let category = store.categories.find((item) => item.name.toLowerCase() === categoryName.trim().toLowerCase());
      if (!category) category = await store.createCategory(categoryName || "Personal Study");
      const topic = await store.createTopic({ categoryId: category.id, title: topicTitle || title || "Untitled topic" });
      topicId = topic.id;
      resolvedTopicTitle = topic.title;
    }
    const session = await store.startSession({ topicId, title: title || "Focused study", focusMinutes: focus, breakMinutes, notes });
    timer.startTimer({
      activeSessionId: session.id,
      topicTitle: resolvedTopicTitle || "Current topic",
      sessionTitle: session.title,
      focusMinutes: focus,
      breakMinutes,
      sessionMode,
      plannedCycles,
      afterFinalCycleBehavior,
      longBreakMinutes
    });
    if (timer.startAutomatically) void handleOpenOverlay();
  }

  async function attachCheatsheet() {
    if (!store.activeSession) return;
    const path = await pickLocalFile();
    if (!path) return;
    const fileName = path.split(/[\\/]/).pop() ?? "Cheatsheet";
    await store.addCheatsheet({ topicId: store.activeSession.topic_id, sessionId: store.activeSession.id, title: fileName, filePath: path, fileType: inferFileType(path) });
    setMaterialMessage(`Attached ${fileName}.`);
  }

  async function importQuestions() {
    const path = await pickLocalFile(["json"]);
    if (!path || !store.activeSession) return;
    try {
      const text = await readTextFile(path);
      const result = parseQuestionImport(text);
      if (!result.ok) {
        setImportError(result.error);
        return;
      }
      await store.importQuestionSet(result.data, store.activeSession.id);
      setImportError("");
      setMaterialMessage(`Imported ${result.data.questions.length} questions.`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not import the selected file.");
    }
  }

  async function finishSession() {
    if (!store.activeSession) return;
    await store.endSession({ sessionId: store.activeSession.id, reflection, understanding, difficulty, chatgptLink, scheduleRevisions: schedule });
    timer.endTimer();
    setNotes("");
    setReflection("");
    setChatgptLink("");
  }

  async function handleOpenOverlay() {
    const result = await openMiniOverlay();
    if (!result.ok) setOverlayError("The Mini Overlay could not be opened. The main timer will keep running here.");
    else setOverlayError("");
  }

  const minutes = String(Math.floor(timer.remainingSeconds / 60)).padStart(2, "0");
  const seconds = String(timer.remainingSeconds % 60).padStart(2, "0");
  const summary = formatSessionPlanSummary({ sessionMode, plannedCycles, focusMinutes: focus, breakMinutes, afterFinalCycleBehavior, longBreakMinutes });
  const progress = timer.totalPhaseSeconds ? 100 - (timer.remainingSeconds / timer.totalPhaseSeconds) * 100 : 0;
  const activeSessionSheets = store.activeSession ? store.cheatsheets.filter((sheet) => sheet.session_id === store.activeSession?.id) : [];
  const activeSessionSets = store.activeSession ? store.questionSets.filter((set) => set.session_id === store.activeSession?.id) : [];

  return (
    <>
      <PageHeader title="Today" eyebrow={format(new Date(), "EEEE, MMMM d")} actions={!store.activeSession ? <button className="btn primary" onClick={handleStart}><Play size={17} />Start study session</button> : null} />
      <section className="grid two">
        <div className="card stat"><span className="muted">Focused today</span><strong>{todayMinutes}m</strong></div>
        <div className="card stat"><span className="muted">Pomodoros</span><strong>{pomodoros}</strong></div>
      </section>

      <section className="grid two" style={{ marginTop: 20 }}>
        <div className="card raised">
          {store.activeSession ? (
            <div className="grid">
              <div className="split">
                <div>
                  <h2>{store.activeSession.title}</h2>
                  <p className="muted">{timer.topicTitle || store.activeSession.topic_title || "Current topic"}</p>
                </div>
                <span className="pill">{timer.totalCycles ? `Cycle ${timer.currentCycle} / ${timer.totalCycles}` : `Cycle ${timer.currentCycle}`}</span>
              </div>
              <div className="button-row">
                <span className="pill">{statusLabel(timer)}</span>
                <button className="btn" onClick={handleOpenOverlay}><Layers2 size={17} />Open Mini Overlay</button>
              </div>
              {overlayError ? <p className="muted">{overlayError}</p> : null}
              <TimerRing
                progress={progress}
                time={`${minutes}:${seconds}`}
                label={statusLabel(timer)}
                state={!timer.isRunning ? "paused" : timer.phase === "break" || timer.phase === "long_break" ? "break" : "focus"}
              />
              {timer.awaitingFinalChoice ? (
                <div className="card">
                  <h3>Planned cycles complete</h3>
                  <p className="muted">Choose what feels right for this session.</p>
                  <div className="button-row"><button className="btn" onClick={timer.continueAnotherCycle}>Continue another cycle</button><button className="btn" onClick={timer.takeLongBreak}>Take long break</button><button className="btn primary" onClick={timer.endTimer}>End and wrap up</button></div>
                </div>
              ) : timer.awaitingNextPhase ? (
                <div className="card">
                  <h3>{nextPhaseHeading(timer.awaitingNextPhase, timer.phase)}</h3>
                  <p className="muted">{nextPhaseHint(timer.awaitingNextPhase)}</p>
                  <div className="button-row">
                    <button className="btn primary" onClick={timer.confirmNextPhase}>{nextPhaseActionLabel(timer.awaitingNextPhase)}</button>
                    <button className="btn" onClick={timer.endTimer}>Go to wrap-up</button>
                  </div>
                </div>
              ) : <div className="button-row"><button className="btn primary" onClick={timer.toggleRunning}>{timer.isRunning ? "Pause" : "Resume"}</button><button className="btn" onClick={timer.skipPhase}>Skip phase</button><button className="btn" onClick={timer.endTimer}>Go to wrap-up</button></div>}
              <label className="field">
                <span>Study notes</span>
                <textarea className="textarea" value={notes || store.activeSession.notes || ""} onChange={(event) => { setNotes(event.target.value); void store.updateSessionNotes(store.activeSession!.id, event.target.value); }} />
              </label>
            </div>
          ) : (
            <div className="grid">
              <h2>Begin a focused session</h2>
              <label className="field"><span>Session title</span><input className="input" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
              <label className="field"><span>Existing topic</span><select className="select" value={selectedTopicId} onChange={(event) => setSelectedTopicId(event.target.value)}><option value="">Create or choose...</option>{store.topics.map((topic) => <option value={topic.id} key={topic.id}>{topic.title}</option>)}</select></label>
              {!selectedTopicId ? <div className="grid two"><label className="field"><span>Category</span><input className="input" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Machine Learning" /></label><label className="field"><span>Topic</span><input className="input" value={topicTitle} onChange={(event) => setTopicTitle(event.target.value)} placeholder="Decision Trees" /></label></div> : null}
              <div className="button-row">{presets.map((preset) => <button className="btn" key={preset.label} onClick={() => { setFocus(preset.focus); setBreakMinutes(preset.break); }}>{preset.label}</button>)}</div>
              <div className="grid two"><label className="field"><span>Focus minutes</span><input className="input" type="number" value={focus} onChange={(event) => setFocus(Number(event.target.value))} /></label><label className="field"><span>Break minutes</span><input className="input" type="number" value={breakMinutes} onChange={(event) => setBreakMinutes(Number(event.target.value))} /></label></div>
              <div className="card">
                <h3>Session planning</h3>
                <div className="button-row" role="radiogroup" aria-label="Session mode">
                  <button className={`btn ${sessionMode === "planned" ? "primary" : ""}`} type="button" onClick={() => setSessionMode("planned")}>Planned cycles</button>
                  <button className={`btn ${sessionMode === "open_ended" ? "primary" : ""}`} type="button" onClick={() => setSessionMode("open_ended")}>Open-ended</button>
                </div>
                {sessionMode === "planned" ? <div className="grid two" style={{ marginTop: 14 }}><label className="field"><span>Planned cycles</span><input className="input" type="number" min="1" max="12" value={plannedCycles} onChange={(event) => setPlannedCycles(Math.max(1, Math.min(12, Number(event.target.value))))} /></label><label className="field"><span>After final cycle</span><select className="select" value={afterFinalCycleBehavior} onChange={(event) => setAfterFinalCycleBehavior(event.target.value as AfterFinalCycleBehavior)}><option value="ask">Ask me</option><option value="wrap_up">Go to wrap-up</option><option value="long_break">Start long break</option></select></label></div> : null}
                {afterFinalCycleBehavior === "long_break" && sessionMode === "planned" ? <label className="field" style={{ marginTop: 14 }}><span>Long break minutes</span><input className="input" type="number" min="1" value={longBreakMinutes} onChange={(event) => setLongBreakMinutes(Number(event.target.value))} /></label> : null}
                <p className="muted" style={{ marginBottom: 0 }}>{summary}</p>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          {store.activeSession ? (
            <div className="grid">
              <h2>Session closeout</h2>
              <label className="field"><span>What did you understand?</span><textarea className="textarea" value={reflection} onChange={(event) => setReflection(event.target.value)} /></label>
              <div className="grid two"><label className="field"><span>Understanding</span><input className="input" type="number" min="1" max="5" value={understanding} onChange={(event) => setUnderstanding(Number(event.target.value))} /></label><label className="field"><span>Difficulty</span><input className="input" type="number" min="1" max="5" value={difficulty} onChange={(event) => setDifficulty(Number(event.target.value))} /></label></div>
              <label className="field"><span>ChatGPT link</span><input className="input" value={chatgptLink} onChange={(event) => setChatgptLink(event.target.value)} placeholder="https://chatgpt.com/share/..." /></label>
              <label className="toggle"><input type="checkbox" checked={schedule} onChange={(event) => setSchedule(event.target.checked)} /> <span>Schedule spaced repetition</span></label>
              <div className="button-row"><button className="btn" onClick={attachCheatsheet}><Paperclip size={17} />Attach cheatsheet</button><button className="btn" onClick={importQuestions}>Import Q&A</button><button className="btn primary" onClick={finishSession}><Square size={17} />End session</button></div>
              {materialMessage ? <p className="muted">{materialMessage}</p> : null}
              {activeSessionSheets.length || activeSessionSets.length ? (
                <div className="list">
                  {activeSessionSheets.map((sheet) => <div className="list-item" key={sheet.id}><strong>{sheet.title}</strong><span className="muted">Cheatsheet attached</span></div>)}
                  {activeSessionSets.map((set) => <div className="list-item" key={set.id}><strong>{set.title}</strong><span className="muted">Q&A imported</span></div>)}
                </div>
              ) : null}
              {importError ? <p className="muted">{importError}</p> : null}
            </div>
          ) : (
            <div className="grid">
              <h2>Due today</h2>
              {dueRevisions.length || dueQuestions.length ? <p className="muted">{dueRevisions.length} topic revisions and {dueQuestions.length} questions are ready for review.</p> : <EmptyState>Nothing is due. A good day for one careful session or a light review.</EmptyState>}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
