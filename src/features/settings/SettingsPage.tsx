import { useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAppStore } from "../../store/appStore";
import { useSessionTimerStore } from "../../store/sessionTimerStore";
import { closeMiniOverlay, openMiniOverlay } from "../../services/overlayWindowService";
import { exportDatabaseToFile, importDatabaseFromFile } from "../../services/backupService";
import { SOUND_VOLUME_MAX, getVolume, previewBell, setVolume, unlockAudio } from "../../services/soundService";
import { POMODORO_PRESETS, getDefaultPomodoroId, setDefaultPomodoro, type PomodoroPresetId } from "../../services/preferencesService";
import { confirmDialog, toast } from "../../store/uiStore";

export function SettingsPage() {
  const { theme, setTheme, resetAll } = useAppStore();
  const timer = useSessionTimerStore();
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [volume, setVolumeState] = useState(() => getVolume());
  const [pomodoroPreset, setPomodoroPreset] = useState<PomodoroPresetId>(() => getDefaultPomodoroId());

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
          <label className="field">
            <span>Default Pomodoro</span>
            <select className="select" value={pomodoroPreset} onChange={(event) => handlePomodoroChange(event.target.value as PomodoroPresetId)}>
              {POMODORO_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
            </select>
          </label>
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
      </section>
    </>
  );
}
