import { useLayoutEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { isPast, isToday, parseISO } from "date-fns";
import { BarChart3, BookMarked, CalendarClock, CheckCircle2, ClipboardList, FolderInput, GraduationCap, Home, Library, MessageSquareText, Settings, TimerReset } from "lucide-react";
import { useAppStore } from "../../store/appStore";
import { KeyboardShortcuts } from "../ui/KeyboardShortcuts";

const navGroups = [
  {
    label: "Focus",
    items: [
      { to: "/", label: "Today", icon: Home },
      { to: "/sessions", label: "Sessions", icon: TimerReset },
      { to: "/revisions", label: "Revisions", icon: CalendarClock },
      { to: "/practice", label: "Practice", icon: CheckCircle2 }
    ]
  },
  {
    label: "Library",
    items: [
      { to: "/topics", label: "Topics", icon: BookMarked },
      { to: "/cheatsheets", label: "Cheatsheets", icon: Library },
      { to: "/materials", label: "Materials", icon: FolderInput },
      { to: "/question-bank", label: "Question Bank", icon: MessageSquareText }
    ]
  },
  {
    label: "Insight",
    items: [
      { to: "/stats", label: "Stats", icon: BarChart3 },
      { to: "/settings", label: "Settings", icon: Settings }
    ]
  }
];

export function AppLayout() {
  const revisions = useAppStore((state) => state.revisions);
  const revisionAlertCount = revisions.filter((r) => {
    if (r.status !== "pending") return false;
    const due = parseISO(r.due_at);
    return isToday(due) || isPast(due);
  }).length;
  const badgeFor = (to: string): number | undefined => (to === "/revisions" && revisionAlertCount > 0 ? revisionAlertCount : undefined);

  const navRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const [indicator, setIndicator] = useState<{ top: number; height: number; left: number; width: number } | null>(null);

  // Position the sliding highlight under the active nav link. Recompute on
  // navigation and resize so it tracks the active item like a segmented control.
  useLayoutEffect(() => {
    function place() {
      const nav = navRef.current;
      const active = nav?.querySelector<HTMLElement>(".nav-link.active");
      if (!nav || !active) {
        setIndicator(null);
        return;
      }
      const navRect = nav.getBoundingClientRect();
      const rect = active.getBoundingClientRect();
      setIndicator({ top: rect.top - navRect.top, height: rect.height, left: rect.left - navRect.left, width: rect.width });
    }
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <GraduationCap size={21} />
          </span>
          <span className="brand-text">
            <strong>Study Hub</strong>
            <span>Local-first learning desk</span>
          </span>
        </div>
        <nav aria-label="Main navigation" ref={navRef}>
          <span
            className="nav-indicator"
            aria-hidden="true"
            style={indicator
              ? { top: indicator.top, height: indicator.height, left: indicator.left, width: indicator.width, opacity: 1 }
              : { opacity: 0 }}
          />
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="nav-section-label">{group.label}</p>
              <div className="nav-list">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const badge = badgeFor(item.to);
                  return (
                    <NavLink
                      className={({ isActive }) => `nav-link${badge ? " alert" : ""}${isActive ? " active" : ""}`}
                      key={item.to}
                      to={item.to}
                      end={item.to === "/"}
                    >
                      <Icon size={18} aria-hidden="true" />
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {badge ? <span className="nav-badge" aria-label={`${badge} due`}>{badge}</span> : null}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-note">
            <ClipboardList size={18} aria-hidden="true" />
            <p>Everything stays on this device. No account, sync, analytics, or remote database.</p>
          </div>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
      <KeyboardShortcuts />
    </div>
  );
}
