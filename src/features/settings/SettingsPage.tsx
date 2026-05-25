import { useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { useAppStore } from "../../store/appStore";
import { useSessionTimerStore } from "../../store/sessionTimerStore";
import { closeMiniOverlay, openMiniOverlay } from "../../services/overlayWindowService";

export function SettingsPage() {
  const { theme, setTheme, resetAll } = useAppStore();
  const timer = useSessionTimerStore();
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [overlayMessage, setOverlayMessage] = useState("");

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
          <p className="muted">Your SQLite database is stored as a local IndexedDB binary. Export, import, and backup controls can be wired to a chosen file path from this same local database layer.</p>
          <div className="button-row"><button className="btn" disabled>Export data</button><button className="btn" disabled>Import data</button><button className="btn" disabled>Database backup</button></div>
          <label className="field"><span>Reset confirmation</span><input className="input" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Type RESET" /></label>
          <button className="btn danger" onClick={reset}>Reset local data</button>
          {message ? <p className="muted">{message}</p> : null}
        </div>
      </section>
    </>
  );
}
