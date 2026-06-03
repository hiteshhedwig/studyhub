import { useState, type CSSProperties } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAppStore } from "../../store/appStore";
import { useSessionTimerStore } from "../../store/sessionTimerStore";
import { closeMiniOverlay, openMiniOverlay } from "../../services/overlayWindowService";
import { exportDatabaseToFile, importDatabaseFromFile } from "../../services/backupService";
import { SOUND_VOLUME_MAX, getVolume, previewBell, setVolume, unlockAudio } from "../../services/soundService";
import { POMODORO_PRESETS, getDefaultPomodoroId, setDefaultPomodoro, getPracticeShortcutsEnabled, setPracticeShortcutsEnabled, getAiEvalConfig, setAiEvalEnabled, setAiApiKey, setAiModel, DEFAULT_AI_MODEL, getExamConfig, setExamEnabled, setExamDate, type PomodoroPresetId } from "../../services/preferencesService";
import { differenceInCalendarDays } from "date-fns";
import { buildQuestionsFile, parsePracticeFile, saveTextFile, openTextFile, practiceFileName } from "../../services/practiceSyncService";
import { confirmDialog, toast } from "../../store/uiStore";
import { ACCENT_PRESETS } from "../../services/accentPresets";

export function SettingsPage() {
  const { theme, setTheme, accent, setAccent, resetAll, exportPracticeQuestions, exportDueTopicReviews, mergePracticeAttempts } = useAppStore();
  const timer = useSessionTimerStore();
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [volume, setVolumeState] = useState(() => getVolume());
  const [pomodoroPreset, setPomodoroPreset] = useState<PomodoroPresetId>(() => getDefaultPomodoroId());
  const [practiceShortcuts, setPracticeShortcuts] = useState(() => getPracticeShortcutsEnabled());
  const [ai, setAi] = useState(() => getAiEvalConfig());
  const [exam, setExam] = useState(() => getExamConfig());
  const [syncBusy, setSyncBusy] = useState(false);

  function handleVolumeChange(next: number) {
    setVolumeState(next);
    setVolume(next);
  }

  function handleTestSound() {
    unlockAudio();
    previewBell(volume);
  }

  function handlePomodoroChange(id: PomodoroPresetId) {
    setPomodoroPreset(id);
    setDefaultPomodoro(id);
    toast.info(`Default Pomodoro set to ${POMODORO_PRESETS.find((p) => p.id === id)?.label ?? id}.`);
  }

  function handlePracticeShortcutsChange(enabled: boolean) {
    setPracticeShortcuts(enabled);
    setPracticeShortcutsEnabled(enabled);
    toast.info(enabled ? "Practice keyboard shortcuts enabled." : "Practice keyboard shortcuts disabled.");
  }

  function handleAiEnabledChange(enabled: boolean) {
    setAi((prev) => ({ ...prev, enabled }));
    setAiEvalEnabled(enabled);
    if (enabled && !ai.apiKey) toast.info("Add your OpenRouter API key below to start evaluating.");
  }

  function handleAiKeyChange(key: string) {
    setAi((prev) => ({ ...prev, apiKey: key }));
    setAiApiKey(key);
  }

  function handleAiModelChange(model: string) {
    setAi((prev) => ({ ...prev, model }));
    setAiModel(model);
  }

  function handleExamEnabledChange(enabled: boolean) {
    setExam((prev) => ({ ...prev, enabled }));
    setExamEnabled(enabled);
  }

  function handleExamDateChange(date: string) {
    setExam((prev) => ({ ...prev, date }));
    setExamDate(date);
  }

  const examDaysAway = exam.date ? differenceInCalendarDays(new Date(`${exam.date}T00:00:00`), new Date()) : null;

  async function handleExport() {
    setBusy("export");
    const result = await exportDatabaseToFile();
    setBusy(null);
    if (result.ok) toast.success("Backup saved.");
    else toast.danger(result.reason ?? "Export failed.");
  }

  async function handleImport() {
    setBusy("import");
    const result = await importDatabaseFromFile();
    setBusy(null);
    if (result.ok) {
      toast.success("Backup restored. Reloading…");
      setTimeout(() => window.location.reload(), 600);
    } else {
      toast.danger(result.reason ?? "Import failed.");
    }
  }

  async function exportQuestionsForPhone() {
    setSyncBusy(true);
    try {
      const questions = await exportPracticeQuestions();
      const topicReviews = await exportDueTopicReviews();
      const examDate = exam.enabled && exam.date ? exam.date : null;
      const saved = await saveTextFile(practiceFileName("studyhub-questions"), buildQuestionsFile(questions, examDate, topicReviews));
      if (saved) {
        const reviewNote = topicReviews.length ? ` · ${topicReviews.length} topic review${topicReviews.length === 1 ? "" : "s"} due` : "";
        toast.success(`Exported ${questions.length} questions for the phone app.${reviewNote}`);
      }
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : "Could not export questions.");
    } finally {
      setSyncBusy(false);
    }
  }

  async function importPracticeFromPhone() {
    setSyncBusy(true);
    try {
      const text = await openTextFile();
      if (!text) return;
      const parsed = parsePracticeFile(text);
      if (!parsed.ok) {
        toast.danger(parsed.error);
        return;
      }
      const summary = await mergePracticeAttempts(parsed.attempts);
      toast.success(
        `Merged ${summary.merged} new attempt${summary.merged === 1 ? "" : "s"} across ${summary.questions} question${summary.questions === 1 ? "" : "s"}${summary.skipped ? ` · ${summary.skipped} skipped` : ""}.`
      );
    } catch (error) {
      toast.danger(error instanceof Error ? error.message : "Could not merge practice.");
    } finally {
      setSyncBusy(false);
    }
  }

  async function reset() {
    const ok = await confirmDialog({
      title: "Reset all local data?",
      message: "Every topic, session, cheatsheet, question, and revision will be wiped. This cannot be undone. Consider exporting a backup first.",
      confirmLabel: "Reset everything",
      tone: "danger"
    });
    if (!ok) return;
    await resetAll();
    toast.success("Local database reset.");
  }

  async function openOverlay() {
    const result = await openMiniOverlay();
    if (result.ok) toast.success("Mini Overlay opened.");
    else toast.danger("The Mini Overlay could not be opened from this environment.");
  }

  async function toggleOverlay(enabled: boolean) {
    if (enabled) {
      await openOverlay();
    } else {
      await closeMiniOverlay();
      toast.info("Mini Overlay closed.");
    }
  }

  return (
    <>
      <PageHeader title="Settings" eyebrow="Local preferences and database care." />
      <section className="grid two">
        <div className="card grid">
          <h2>Appearance</h2>
          <label className="field">
            <span>Theme</span>
            <select className="select" value={theme} onChange={(event) => setTheme(event.target.value as typeof theme)}>
              <option value="warm-dark">Dark</option>
              <option value="soft-light">Light</option>
              <option value="system">System</option>
            </select>
          </label>
          <div className="field">
            <span>Accent color</span>
            <div className="accent-swatches" role="radiogroup" aria-label="Accent color">
              {ACCENT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`accent-swatch${accent === preset.id ? " selected" : ""}`}
                  style={{ "--swatch": preset.swatch } as CSSProperties}
                  role="radio"
                  aria-checked={accent === preset.id}
                  aria-label={preset.label}
                  title={preset.label}
                  onClick={() => setAccent(preset.id)}
                />
              ))}
            </div>
          </div>
          <label className="field">
            <span>Default Pomodoro</span>
            <select className="select" value={pomodoroPreset} onChange={(event) => handlePomodoroChange(event.target.value as PomodoroPresetId)}>
              {POMODORO_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
            </select>
          </label>
        </div>

        <div className="card grid">
          <h2>Practice</h2>
          <p className="muted">Keyboard shortcuts during practice: Space reveals then advances, → or N skips, and 1–4 rate the card.</p>
          <label className="toggle">
            <input type="checkbox" checked={practiceShortcuts} onChange={(event) => handlePracticeShortcutsChange(event.target.checked)} />
            <span>Enable practice keyboard shortcuts</span>
          </label>
        </div>

        <div className="card grid">
          <h2>Exam mode</h2>
          <p className="muted">
            Set your exam / interview date and review intervals compress as it nears, so every card gets seen again (more
            and more often) before the day. When off, scheduling is normal adaptive.
          </p>
          <label className="toggle">
            <input type="checkbox" checked={exam.enabled} onChange={(event) => handleExamEnabledChange(event.target.checked)} />
            <span>Enable exam mode</span>
          </label>
          <label className="field">
            <span>Target date</span>
            <input className="input" type="date" value={exam.date} onChange={(event) => handleExamDateChange(event.target.value)} />
          </label>
          {exam.enabled && examDaysAway !== null ? (
            <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
              {examDaysAway > 0
                ? `${examDaysAway} day${examDaysAway === 1 ? "" : "s"} away — intervals capped near ${Math.max(1, Math.floor(examDaysAway / 2))} day${Math.max(1, Math.floor(examDaysAway / 2)) === 1 ? "" : "s"}.`
                : examDaysAway === 0
                  ? "Exam is today — everything reviews daily."
                  : "This date has passed — set a new one or turn exam mode off."}
            </p>
          ) : null}
        </div>

        <div className="card grid">
          <h2>AI evaluation</h2>
          <p className="muted">
            Optional. When enabled, the <strong>AI Evaluation</strong> button in Practice sends your typed answer and the
            question's canonical answer to OpenRouter to grade your recall. This is the only feature that makes a network
            call — it stays off until you enable it and add a key.
          </p>
          <label className="toggle">
            <input type="checkbox" checked={ai.enabled} onChange={(event) => handleAiEnabledChange(event.target.checked)} />
            <span>Enable AI evaluation in Practice</span>
          </label>
          <label className="field">
            <span>OpenRouter API key</span>
            <input className="input" type="password" autoComplete="off" placeholder="sk-or-…" value={ai.apiKey} onChange={(event) => handleAiKeyChange(event.target.value)} />
          </label>
          <label className="field">
            <span>Model</span>
            <input className="input" placeholder={DEFAULT_AI_MODEL} value={ai.model} onChange={(event) => handleAiModelChange(event.target.value)} />
          </label>
          <p className="muted" style={{ fontSize: "var(--text-xs)" }}>
            Use a model that supports structured output — OpenRouter <code>:free</code> tiers do not, so grading will fail.
            Good picks: <code>google/gemini-2.0-flash-001</code>, <code>openai/gpt-4o-mini</code>. Create a key at openrouter.ai/keys;
            it's stored locally in plain text on this device.
          </p>
        </div>

        <div className="card grid">
          <h2>Sounds</h2>
          <p className="muted">A soft tick plays in the last 5 seconds of each phase, and a fuller bell rings when a phase ends.</p>
          <label className="field">
            <span>Volume — {Math.round(volume * 100)}%</span>
            <input
              className="input"
              type="range"
              min={0}
              max={SOUND_VOLUME_MAX}
              step={0.05}
              value={volume}
              onChange={(event) => handleVolumeChange(Number(event.target.value))}
            />
          </label>
          <div className="button-row">
            <button className="btn" type="button" onClick={handleTestSound}>Test sound</button>
            <button className="btn" type="button" onClick={() => handleVolumeChange(0)}>Mute</button>
          </div>
        </div>

        <div className="card grid">
          <h2>Mini Overlay</h2>
          <p className="muted">A small always-on-top companion for the active session timer.</p>
          <label className="toggle"><input type="checkbox" checked={timer.isOverlayOpen} onChange={(event) => void toggleOverlay(event.target.checked)} /> <span>Enable overlay</span></label>
          <label className="toggle"><input type="checkbox" checked={timer.startAutomatically} onChange={(event) => timer.setOverlayPreference("startAutomatically", event.target.checked)} /> <span>Start overlay automatically with sessions</span></label>
          <label className="toggle"><input type="checkbox" checked={timer.alwaysOnTop} onChange={(event) => timer.setOverlayPreference("alwaysOnTop", event.target.checked)} /> <span>Show overlay always on top</span></label>
          <label className="field">
            <span>Default mode</span>
            <select className="select" value={timer.defaultCollapsed ? "collapsed" : "expanded"} onChange={(event) => timer.setOverlayPreference("defaultCollapsed", event.target.value === "collapsed")}>
              <option value="expanded">Expanded</option>
              <option value="collapsed">Collapsed</option>
            </select>
          </label>
          <div className="button-row"><button className="btn" onClick={openOverlay}>Open Mini Overlay</button></div>
        </div>

        <div className="card grid">
          <h2>Data</h2>
          <p className="muted">Your SQLite database lives in the system WebView's IndexedDB. Export a <code>.sqlite</code> backup to keep a copy or move data to another machine; importing replaces the current database.</p>
          <div className="button-row">
            <button className="btn" onClick={handleExport} disabled={busy !== null}>{busy === "export" ? "Exporting…" : "Export data"}</button>
            <button className="btn" onClick={handleImport} disabled={busy !== null}>{busy === "import" ? "Importing…" : "Import data"}</button>
          </div>
          <button className="btn danger" onClick={reset}>Reset local data…</button>
        </div>

        <div className="card grid">
          <h2>Practice sync (phone)</h2>
          <p className="muted">
            Practice on the go: <strong>export your questions</strong> to a JSON file, put it in your shared cloud drive
            (Google Drive / Dropbox), and load it in the phone practice app. When you're back, <strong>import &amp; merge</strong>
            the day's practice — it unions new attempts and recomputes progress, so nothing is overwritten or double-counted.
          </p>
          <div className="button-row">
            <button className="btn" onClick={exportQuestionsForPhone} disabled={syncBusy}>{syncBusy ? "Working…" : "Export questions for phone"}</button>
            <button className="btn primary" onClick={importPracticeFromPhone} disabled={syncBusy}>{syncBusy ? "Working…" : "Import &amp; merge practice"}</button>
          </div>
        </div>
      </section>
    </>
  );
}
