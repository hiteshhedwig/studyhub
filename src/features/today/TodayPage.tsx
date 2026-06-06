import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { differenceInCalendarDays, format, isPast, isToday, parseISO } from "date-fns";
import { ChevronRight, Flame, Layers2, Paperclip, Play, Square, Target } from "lucide-react";
import { currentFocusStreak, focusHeatmap } from "../../services/statsService";
import { isQuestionDue } from "../../services/spacedRepetition";
import { FocusHeatmap } from "../../components/charts/FocusHeatmap";
import { PageHeader } from "../../components/ui/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { TimerRing } from "../../components/ui/TimerRing";
import { CountUp } from "../../components/ui/CountUp";
import { NotesBoard } from "./NotesBoard";
import { useAppStore } from "../../store/appStore";
import { useSessionTimerStore } from "../../store/sessionTimerStore";
import { inferFileType, pickLocalFile, readTextFile } from "../../services/fileStorage";
import { parseQuestionImport } from "../../services/importQuestions";
import { formatSessionPlanSummary } from "../../services/timerLogic";
import { openMiniOverlay } from "../../services/overlayWindowService";
import { unlockAudio } from "../../services/soundService";
import { useTimerSounds } from "../../hooks/useTimerSounds";
import { getDefaultPomodoro, POMODORO_PRESETS, getActiveExamDate } from "../../services/preferencesService";
import { confirmDialog, toast } from "../../store/uiStore";
import type { AfterFinalCycleBehavior, SessionMode } from "../../types/timer";
import { formatMinutes } from "../../utils/formatTime";

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
  const defaults = useMemo(() => getDefaultPomodoro(), []);
  const [title, setTitle] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [topicTitle, setTopicTitle] = useState("");
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [focus, setFocus] = useState(defaults.focus);
  const [breakMinutes, setBreakMinutes] = useState(defaults.break);
  const [sessionMode, setSessionMode] = useState<SessionMode>("planned");
  const [plannedCycles, setPlannedCycles] = useState(2);
  const [afterFinalCycleBehavior, setAfterFinalCycleBehavior] = useState<AfterFinalCycleBehavior>("ask");
  const [longBreakMinutes, setLongBreakMinutes] = useState(20);
  const [notes, setNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  const notesSaveTimer = useRef<number | null>(null);
  const notesHideTimer = useRef<number | null>(null);
  const [reflection, setReflection] = useState("");
  const [understanding, setUnderstanding] = useState(3);
  const [difficulty, setDifficulty] = useState(3);
  const [chatgptLink, setChatgptLink] = useState("");
  const [schedule, setSchedule] = useState(true);
  const [recordedCycles, setRecordedCycles] = useState(timer.completedFocusCycles);

  const todaySessions = store.sessions.filter((session) => isToday(parseISO(session.started_at)));
  const dueRevisions = store.revisions.filter((revision) => revision.status === "pending" && isToday(parseISO(revision.due_at)));
  const lateRevisions = store.revisions.filter((revision) => revision.status === "pending" && isPast(parseISO(revision.due_at)) && !isToday(parseISO(revision.due_at)));
  const examDate = getActiveExamDate();
  const examDaysAway = examDate ? differenceInCalendarDays(examDate, new Date()) : null;
  const dueQuestions = store.questions.filter((question) => isQuestionDue(question, examDate));
  // Soonest future due date among already-seen cards — shown when nothing is due
  // now, so "0 cards due" reads as "come back on Jun 3" rather than a dead end.
  const nextQuestionDueAt = store.questions
    .filter((question) => question.review_count > 0)
    .map((question) => parseISO(question.next_due_at))
    .filter((date) => date.getTime() > Date.now())
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const todayMinutes = todaySessions.reduce((sum, session) => sum + session.focus_minutes * session.pomodoros_completed, 0);
  const pomodoros = todaySessions.reduce((sum, session) => sum + session.pomodoros_completed, 0);
  const streak = currentFocusStreak(store.sessions);
  const extendedToday = todayMinutes > 0; // the flame only "breathes" on days you keep the streak alive
  const neverSeenCount = store.questions.filter((question) => question.review_count === 0).length;
  const heatmap = useMemo(() => focusHeatmap(store.sessions), [store.sessions]);
  const [cycleRatings, setCycleRatings] = useState<{ hard: number; ok: number; easy: number }>({ hard: 0, ok: 0, easy: 0 });
  const [ratedThisPrompt, setRatedThisPrompt] = useState(false);

  // Recently used topics (max 5) for quick-start when no session is active.
  const recentTopics = useMemo(() => {
    const map = new Map<string, { id: string; title: string; startedAt: string }>();
    for (const session of store.sessions) {
      if (!map.has(session.topic_id)) {
        map.set(session.topic_id, { id: session.topic_id, title: session.topic_title ?? "Topic", startedAt: session.started_at });
      }
    }
    return Array.from(map.values()).slice(0, 5);
  }, [store.sessions]);

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
    setNotes("");
    setCycleRatings({ hard: 0, ok: 0, easy: 0 });
  }, [timer.activeSessionId]);

  // Reset the "rated this prompt" flag whenever a new awaitingNextPhase appears.
  useEffect(() => {
    if (timer.awaitingNextPhase) setRatedThisPrompt(false);
  }, [timer.awaitingNextPhase, timer.completedFocusCycles]);

  function rateCycle(kind: "hard" | "ok" | "easy") {
    setCycleRatings((prev) => ({ ...prev, [kind]: prev[kind] + 1 }));
    setRatedThisPrompt(true);
  }

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

  // Global Space-to-pause when not typing in a field.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== " " || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) return;
      if (!timer.activeSessionId || timer.phase === "idle" || timer.phase === "completed") return;
      if (timer.awaitingNextPhase || timer.awaitingFinalChoice) return;
      event.preventDefault();
      timer.toggleRunning();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [timer]);

  async function handleStart() {
    let topicId = selectedTopicId;
    let resolvedTopicTitle = store.topics.find((topic) => topic.id === selectedTopicId)?.title ?? topicTitle;
    if (!topicId) {
      if (!topicTitle.trim() && !title.trim()) {
        toast.warning("Give the topic or session a title before starting.");
        return;
      }
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

  function handleQuickStartFromTopic(topicId: string) {
    setSelectedTopicId(topicId);
    // Scroll the form into view as a small affordance.
    setTimeout(() => {
      document.querySelector<HTMLElement>("input.input")?.focus();
    }, 0);
  }

  async function attachCheatsheet() {
    if (!store.activeSession) return;
    const path = await pickLocalFile();
    if (!path) return;
    const fileName = path.split(/[\\/]/).pop() ?? "Cheatsheet";
    await store.addCheatsheet({ topicId: store.activeSession.topic_id, sessionId: store.activeSession.id, title: fileName, filePath: path, fileType: inferFileType(path) });
    toast.success(`Attached ${fileName}.`);
  }

  async function importQuestions() {
    const path = await pickLocalFile(["json"]);
    if (!path || !store.activeSession) return;
    try {
      const text = await readTextFile(path);
      const result = parseQuestionImport(text);
      if (!result.ok) {
        toast.danger(result.error);
        return;
      }
      await store.importQuestionSet(result.data, store.activeSession.id);
      toast.success(`Imported ${result.data.questions.length} questions.`);
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : "Could not import the selected file.");
    }
  }

  async function finishSession() {
    if (!store.activeSession) return;
    await store.endSession({ sessionId: store.activeSession.id, reflection, understanding, difficulty, chatgptLink, scheduleRevisions: schedule });
    timer.endTimer();
    setNotes("");
    setReflection("");
    setChatgptLink("");
    toast.success("Session wrapped up.");
  }

  async function handleEndSessionEarly() {
    if (!store.activeSession) return;
    const ok = await confirmDialog({
      title: "End this session early?",
      message: "You'll jump straight to wrap-up. Pomodoros already completed are kept.",
      confirmLabel: "Go to wrap-up"
    });
    if (!ok) return;
    timer.endTimer();
  }

  async function handleOpenOverlay() {
    const result = await openMiniOverlay();
    if (!result.ok) toast.warning("The Mini Overlay could not be opened. The main timer will keep running here.");
  }

  function handleNotesChange(value: string) {
    setNotes(value);
    if (notesSaveTimer.current) window.clearTimeout(notesSaveTimer.current);
    notesSaveTimer.current = window.setTimeout(() => {
      if (!store.activeSession) return;
      void store.updateSessionNotes(store.activeSession.id, value);
      setNotesSaved(true);
      if (notesHideTimer.current) window.clearTimeout(notesHideTimer.current);
      notesHideTimer.current = window.setTimeout(() => setNotesSaved(false), 1400);
    }, 400);
  }

  // Flush pending notes save on unmount.
  useEffect(() => {
    return () => {
      if (notesSaveTimer.current) window.clearTimeout(notesSaveTimer.current);
      if (notesHideTimer.current) window.clearTimeout(notesHideTimer.current);
    };
  }, []);

  const minutes = String(Math.floor(timer.remainingSeconds / 60)).padStart(2, "0");
  const seconds = String(timer.remainingSeconds % 60).padStart(2, "0");
  const summary = formatSessionPlanSummary({ sessionMode, plannedCycles, focusMinutes: focus, breakMinutes, afterFinalCycleBehavior, longBreakMinutes });
  const progress = timer.totalPhaseSeconds ? 100 - (timer.remainingSeconds / timer.totalPhaseSeconds) * 100 : 0;
  const activeSessionSheets = store.activeSession ? store.cheatsheets.filter((sheet) => sheet.session_id === store.activeSession?.id) : [];
  const activeSessionSets = store.activeSession ? store.questionSets.filter((set) => set.session_id === store.activeSession?.id) : [];

  return (
    <>
      <PageHeader
        title="Today"
        eyebrow={format(new Date(), "EEEE, MMMM d")}
        actions={!store.activeSession ? <button className="btn primary" onClick={handleStart}><Play size={17} />Start study session</button> : null}
      />
      {examDate && examDaysAway !== null && examDaysAway >= 0 ? (
        <div className="exam-banner">
          <Target size={18} aria-hidden="true" />
          <div className="exam-banner-text">
            <strong>{examDaysAway === 0 ? "Exam is today" : `Exam in ${examDaysAway} day${examDaysAway === 1 ? "" : "s"}`}</strong>
            <span>{dueQuestions.length} due · {neverSeenCount} never seen</span>
          </div>
        </div>
      ) : null}
      <section className="grid two">
        <div className="card stat">
          <span className="muted" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            Focused today
            {streak >= 2 ? (
              <span
                className={`streak-pill${extendedToday ? " lit" : ""}`}
                title={extendedToday ? `${streak}-day streak — kept alive today` : `${streak}-day streak — study today to keep it going`}
              >
                <Flame size={13} className="streak-flame" /> {streak} day streak
              </span>
            ) : null}
          </span>
          <strong><CountUp value={todayMinutes} format={formatMinutes} /></strong>
        </div>
        <div className="card stat"><span className="muted">Pomodoros</span><strong><CountUp value={pomodoros} /></strong></div>
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
              <div className="split">
                <span className="pill">{statusLabel(timer)}</span>
                <button className="btn" onClick={handleOpenOverlay}><Layers2 size={17} />Open Mini Overlay</button>
              </div>
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
                  <div className="button-row">
                    <button className="btn" onClick={timer.continueAnotherCycle}>Continue another cycle</button>
                    <button className="btn" onClick={timer.takeLongBreak}>Take long break</button>
                    <button className="btn primary" onClick={timer.endTimer}>End and wrap up</button>
                  </div>
                </div>
              ) : timer.awaitingNextPhase ? (
                <div className="card">
                  <h3>{nextPhaseHeading(timer.awaitingNextPhase, timer.phase)}</h3>
                  <p className="muted">{nextPhaseHint(timer.awaitingNextPhase)}</p>
                  {timer.phase === "focus" && (timer.awaitingNextPhase === "break" || timer.awaitingNextPhase === "long_break") ? (
                    ratedThisPrompt ? (
                      <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>Noted — your closeout will reflect this.</p>
                    ) : (
                      <div className="cycle-rate-row">
                        <span className="muted" style={{ fontSize: "var(--text-xs)" }}>How was that cycle?</span>
                        <button type="button" className="btn small rating hard" onClick={() => rateCycle("hard")}>Hard</button>
                        <button type="button" className="btn small rating good" onClick={() => rateCycle("ok")}>OK</button>
                        <button type="button" className="btn small rating easy" onClick={() => rateCycle("easy")}>Easy</button>
                      </div>
                    )
                  ) : null}
                  <div className="button-row">
                    <button className="btn primary" onClick={timer.confirmNextPhase}>{nextPhaseActionLabel(timer.awaitingNextPhase)}</button>
                  </div>
                </div>
              ) : (
                <div className="button-row">
                  <button className="btn primary" onClick={timer.toggleRunning}>{timer.isRunning ? "Pause" : "Resume"}</button>
                  <button className="btn" onClick={timer.skipPhase}>Skip phase</button>
                </div>
              )}
              <label className="field">
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  Study notes
                  <span className={`saved-indicator ${notesSaved ? "visible" : ""}`}><span className="dot" />Saved</span>
                </span>
                <textarea className="textarea" value={notes || store.activeSession.notes || ""} onChange={(event) => handleNotesChange(event.target.value)} />
              </label>
              {/* "End session early" lives down here as a quiet text link so it can't be misclicked next to Pause/Skip. */}
              <button
                type="button"
                onClick={() => void handleEndSessionEarly()}
                style={{ background: "transparent", color: "var(--muted)", padding: 0, fontSize: "var(--text-sm)", justifySelf: "start", cursor: "pointer", textDecoration: "underline" }}
              >
                End session early →
              </button>
            </div>
          ) : (
            <div className="grid">
              <h2>Begin a focused session</h2>
              <label className="field"><span>Session title</span><input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Focused study" /></label>
              <label className="field"><span>Existing topic</span>
                <select className="select" value={selectedTopicId} onChange={(event) => setSelectedTopicId(event.target.value)}>
                  <option value="">Create or choose...</option>
                  {store.topics.map((topic) => <option value={topic.id} key={topic.id}>{topic.title}</option>)}
                </select>
              </label>
              {!selectedTopicId ? (
                <div className="grid two">
                  <label className="field"><span>Category</span>
                    <input className="input" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Machine Learning" list="category-options" autoComplete="off" />
                    <datalist id="category-options">
                      {store.categories.map((category) => <option value={category.name} key={category.id} />)}
                    </datalist>
                  </label>
                  <label className="field"><span>Topic</span><input className="input" value={topicTitle} onChange={(event) => setTopicTitle(event.target.value)} placeholder="Decision Trees" /></label>
                </div>
              ) : null}
              <div className="button-row">
                {POMODORO_PRESETS.map((preset) => (
                  <button
                    type="button"
                    className={`btn ${focus === preset.focus && breakMinutes === preset.break ? "primary" : ""}`}
                    key={preset.id}
                    onClick={() => { setFocus(preset.focus); setBreakMinutes(preset.break); }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <details className="disclosure">
                <summary className="disclosure-summary">Advanced</summary>
                <div className="disclosure-body">
                  <div className="grid two">
                    <label className="field"><span>Focus minutes</span><input className="input" type="number" value={focus} onChange={(event) => setFocus(Number(event.target.value))} /></label>
                    <label className="field"><span>Break minutes</span><input className="input" type="number" value={breakMinutes} onChange={(event) => setBreakMinutes(Number(event.target.value))} /></label>
                  </div>
                  <div className="button-row" role="radiogroup" aria-label="Session mode">
                    <button className={`btn ${sessionMode === "planned" ? "primary" : ""}`} type="button" onClick={() => setSessionMode("planned")}>Planned cycles</button>
                    <button className={`btn ${sessionMode === "open_ended" ? "primary" : ""}`} type="button" onClick={() => setSessionMode("open_ended")}>Open-ended</button>
                  </div>
                  {sessionMode === "planned" ? (
                    <div className="grid two">
                      <label className="field"><span>Planned cycles</span><input className="input" type="number" min="1" max="12" value={plannedCycles} onChange={(event) => setPlannedCycles(Math.max(1, Math.min(12, Number(event.target.value))))} /></label>
                      <label className="field"><span>After final cycle</span>
                        <select className="select" value={afterFinalCycleBehavior} onChange={(event) => setAfterFinalCycleBehavior(event.target.value as AfterFinalCycleBehavior)}>
                          <option value="ask">Ask me</option>
                          <option value="wrap_up">Go to wrap-up</option>
                          <option value="long_break">Start long break</option>
                        </select>
                      </label>
                    </div>
                  ) : null}
                  {afterFinalCycleBehavior === "long_break" && sessionMode === "planned" ? (
                    <label className="field"><span>Long break minutes</span><input className="input" type="number" min="1" value={longBreakMinutes} onChange={(event) => setLongBreakMinutes(Number(event.target.value))} /></label>
                  ) : null}
                  <p className="muted" style={{ marginBottom: 0 }}>{summary}</p>
                </div>
              </details>
            </div>
          )}
        </div>

        <div className="card">
          {store.activeSession ? (
            <div className="grid">
              <h2>Session closeout</h2>
              {(cycleRatings.hard + cycleRatings.ok + cycleRatings.easy) > 0 ? (
                <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
                  Your cycles felt: {[
                    cycleRatings.hard ? `${cycleRatings.hard} hard` : null,
                    cycleRatings.ok ? `${cycleRatings.ok} ok` : null,
                    cycleRatings.easy ? `${cycleRatings.easy} easy` : null
                  ].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              <label className="field"><span>What did you understand?</span><textarea className="textarea" value={reflection} onChange={(event) => setReflection(event.target.value)} /></label>
              <div className="grid two">
                <label className="field"><span>Understanding</span><input className="input" type="number" min="1" max="5" value={understanding} onChange={(event) => setUnderstanding(Number(event.target.value))} /></label>
                <label className="field"><span>Difficulty</span><input className="input" type="number" min="1" max="5" value={difficulty} onChange={(event) => setDifficulty(Number(event.target.value))} /></label>
              </div>
              <label className="field"><span>ChatGPT link</span><input className="input" value={chatgptLink} onChange={(event) => setChatgptLink(event.target.value)} placeholder="https://chatgpt.com/share/..." /></label>
              <label className="toggle"><input type="checkbox" checked={schedule} onChange={(event) => setSchedule(event.target.checked)} /> <span>Schedule spaced repetition</span></label>
              <div className="button-row">
                <button className="btn" onClick={attachCheatsheet}><Paperclip size={17} />Attach cheatsheet</button>
                <button className="btn" onClick={importQuestions}>Import Q&A</button>
                <button className="btn primary" onClick={finishSession}><Square size={17} />End session</button>
              </div>
              {activeSessionSheets.length || activeSessionSets.length ? (
                <div className="list">
                  {activeSessionSheets.map((sheet) => <div className="list-item" key={sheet.id}><strong>{sheet.title}</strong><span className="muted">Cheatsheet attached</span></div>)}
                  {activeSessionSets.map((set) => <div className="list-item" key={set.id}><strong>{set.title}</strong><span className="muted">Q&A imported</span></div>)}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="grid">
              <h2>Due today</h2>
              {dueRevisions.length || lateRevisions.length || dueQuestions.length ? (
                <>
                  {/* Topic reviews — "this topic needs a recall check", links to /revisions */}
                  <p className="eyebrow" style={{ margin: 0 }}>Topic reviews</p>
                  {lateRevisions.length ? (
                    <>
                      <p className="muted" style={{ margin: 0, color: "var(--danger)" }}>{lateRevisions.length} late · catch these first</p>
                      <div className="list">
                        {lateRevisions.slice(0, 5).map((revision) => (
                          <Link key={revision.id} to="/revisions" className="list-item" style={{ textDecoration: "none", color: "inherit" }}>
                            <div className="split">
                              <span className="truncate">{revision.topic_title ?? "Topic"}</span>
                              <span className="muted">{format(parseISO(revision.due_at), "MMM d")}</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </>
                  ) : null}
                  {dueRevisions.length ? (
                    <>
                      <p className="muted" style={{ margin: 0 }}>{dueRevisions.length} due today</p>
                      <div className="list">
                        {dueRevisions.map((revision) => (
                          <Link key={revision.id} to="/revisions" className="list-item" style={{ textDecoration: "none", color: "inherit" }}>
                            <div className="split">
                              <span className="truncate">{revision.topic_title ?? "Topic"}</span>
                              <span className="muted">{revision.type.replace("_", " ")}</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </>
                  ) : null}
                  {!lateRevisions.length && !dueRevisions.length ? (
                    <p className="muted" style={{ margin: 0 }}>No topic reviews due.</p>
                  ) : null}

                  {/* Flashcards — individual spaced-repetition cards, links to /practice */}
                  <p className="eyebrow" style={{ margin: "8px 0 0" }}>Flashcards</p>
                  {dueQuestions.length ? (
                    <Link to="/practice" className="list-item" style={{ textDecoration: "none", color: "inherit" }}>
                      <div className="split">
                        <span><strong>{dueQuestions.length}</strong> card{dueQuestions.length === 1 ? "" : "s"} ready to practice</span>
                        <ChevronRight size={16} />
                      </div>
                    </Link>
                  ) : (
                    <div className="list-item">
                      <div className="split">
                        <span className="muted">0 cards due{nextQuestionDueAt ? ` · next ${format(nextQuestionDueAt, "MMM d")}` : ""}</span>
                        <Link to="/practice" className="muted" style={{ whiteSpace: "nowrap" }}>Practice anyway</Link>
                      </div>
                    </div>
                  )}
                </>
              ) : <EmptyState>Nothing is due. A good day for one careful session or a light review.</EmptyState>}
              {recentTopics.length ? (
                <>
                  <h3 style={{ margin: 0 }}>Recent topics</h3>
                  <div className="list stagger">
                    {recentTopics.map((topic, i) => (
                      <button key={topic.id} type="button" className="list-item" style={{ background: "transparent", cursor: "pointer", textAlign: "left", width: "100%", "--i": i } as CSSProperties} onClick={() => handleQuickStartFromTopic(topic.id)}>
                        <div className="split"><span>{topic.title}</span><span className="muted">Pick to start</span></div>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      </section>
      <section style={{ marginTop: 20 }}>
        <div className="card grid">
          <NotesBoard notes={store.notes} />
        </div>
      </section>
      <section style={{ marginTop: 20 }}>
        <div className="card grid">
          <h2>Focus consistency · last year</h2>
          <FocusHeatmap data={heatmap} sessions={store.sessions} />
        </div>
      </section>
    </>
  );
}
