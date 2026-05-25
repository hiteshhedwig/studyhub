import { useEffect } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { useAppStore } from "../store/appStore";

export function App() {
  const load = useAppStore((state) => state.load);
  const isLoading = useAppStore((state) => state.isLoading);
  const error = useAppStore((state) => state.error);
  const theme = useAppStore((state) => state.theme);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const resolved = theme === "system" ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "soft-light" : "warm-dark") : theme;
    document.documentElement.dataset.theme = resolved;
  }, [theme]);

  if (isLoading) {
    return (
      <div className="boot-screen">
        <div className="boot-card">
          <span className="boot-spinner" aria-hidden="true" />
          <p className="muted">Opening your local study desk…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="boot-screen">
        <div className="card raised" style={{ maxWidth: 440 }}>
          <h1>Study Hub could not start</h1>
          <p className="muted">{error}</p>
        </div>
      </div>
    );
  }

  return <AppLayout />;
}
