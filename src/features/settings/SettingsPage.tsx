import { useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAppStore } from "../../store/appStore";
import { useSessionTimerStore } from "../../store/sessionTimerStore";
import { closeMiniOverlay, openMiniOverlay } from "../../services/overlayWindowService";
import { exportDatabaseToFile, importDatabaseFromFile } from "../../services/backupService";
import { SOUND_VOLUME_MAX, getVolume, previewBell, setVolume, unlockAudio } from "../../services/soundService";

export function SettingsPage() {
  const { theme, setTheme, resetAll } = useAppStore();
  const timer = useSessionTimerStore();
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [overlayMessage, setOverlayMessage] = useState("");
  const [dataMessage, setDataMessage] = useState("");
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [volume, setVolumeState] = useState(() => getVolume());

  function handleVolumeChange(next: number) {
    setVolumeState(next);
    setVolume(next);
  }

  function handleTestSound() {
    unlockAudio();
    previewBell(volume);
  }

  async function handleExport() {
    setBusy("export");
    setDataMessage("");
    const result = await exportDatabaseToFile();
    setDataMessage(result.ok ? "Backup saved." : result.reason ?? "Export failed.");
    setBusy(null);
  }

  async function handleImport() {
    setBusy("import");
    setDataMessage("");
    const result = await importDatabaseFromFile();
    setBusy(null);
    if (result.ok) {
      setDataMessage("Backup restored. Reloading…");
      setTimeout(() => window.location.reload(), 600);
    } else {
      setDataMessage(result.reason ?? "Import failed.");
    }
  }

  async function reset() {
    if (confirm !== "RESET") {
      setMessage("Type RESET to clear local data.");
      return;
    }
    await resetAll();
    setMessage("Local database reset.");
    setConfirm("");
  }

  async function openOverlay() {
    const result = await openMiniOverlay();
    setOverlayMessage(result.ok ? "Mini Overlay opened." : "The Mini Overlay could not be opened from this environment.");
  }

  async function toggleOverlay(enabled: boolean) {
    if (enabled) await openOverlay();
    else {
      await closeMiniOverlay();
      setOverlayMessage("Mini Overlay closed.");
    }
  }

  return (
    <>
      <PageHeader title="Settings" eyebrow="Local preferences and database care." />
      <section className="grid two">
        <div className="card grid">
          <h2>Theme</h2>
          <label className="field"><span>Appearance</span><select className="select" value={theme} onChange={(event) => setTheme(event.target.value as typeof theme)}><option value="warm-dark">Dark</option><option value="soft-light">Light</option><option value="system">System</option></select></label>
          <label className="field"><span>Default Pomodoro</span><select className="select" defaultValue="25/5"><option>25/5</option><option>30/10</option><option>50/10</option></select></label>
          <label className="field"><span>Default spaced repetition intervals</span><input className="input" readOnly value="1, 3, 7, 14, 30, 60 days" /></label>
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
          <label className="field"><span>Default mode</span><select className="select" value={timer.defaultCollapsed ? "collapsed" : "expanded"} onChange={(event) => timer.setOverlayPreference("defaultCollapsed", event.target.value === "collapsed")}><option value="expanded">Expanded</option><option value="collapsed">Collapsed</option></select></label>
          <div className="button-row"><button className="btn" onClick={openOverlay}>Open Mini Overlay</button></div>
          {overlayMessage ? <p className="muted">{overlayMessage}</p> : null}
        </div>
        <div className="card grid">
          <h2>Data</h2>
          <p className="muted">Your SQLite database lives in the system WebView's IndexedDB. Export a <code>.sqlite</code> backup to keep a copy or move data to another machine; importing replaces the current database.</p>
          <div className="button-row"><button className="btn" onClick={handleExport} disabled={busy !== null}>{busy === "export" ? "Exporting…" : "Export data"}</button><button className="btn" onClick={handleImport} disabled={busy !== null}>{busy === "import" ? "Importing…" : "Import data"}</button></div>
          {dataMessage ? <p className="muted">{dataMessage}</p> : null}
          <label className="field"><span>Reset confirmation</span><input className="input" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Type RESET" /></label>
          <button className="btn danger" onClick={reset}>Reset local data</button>
          {message ? <p className="muted">{message}</p> : null}
        </div>
      </section>
    </>
  );
}
