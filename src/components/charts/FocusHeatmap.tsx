import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import type { HeatmapCell } from "../../services/statsService";
import type { StudySession } from "../../db/repositories/types";

// Sparse weekday labels (Sun→Sat rows), GitHub shows Mon/Wed/Fri.
const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

type Tooltip = { x: number; y: number; text: string };
type Selected = { x: number; y: number; cell: HeatmapCell };

function tooltipText(cell: HeatmapCell): string {
  const date = format(cell.date, "EEEE, MMM d, yyyy");
  return cell.minutes === 0 ? `No focus on ${date}` : `${cell.minutes}m focused on ${date}`;
}

function sessionMinutes(session: StudySession): number {
  return session.focus_minutes * session.pomodoros_completed;
}

export function FocusHeatmap({ data, sessions = [] }: { data: HeatmapCell[][]; sessions?: StudySession[] }) {
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  const totalMinutes = data.flat().reduce((sum, cell) => sum + cell.minutes, 0);
  const activeDays = data.flat().filter((cell) => cell.minutes > 0).length;

  // Month label sits above the first week-column of each month. Suppress labels
  // that fall too close to the previous one (e.g. the partial first week) so
  // they don't overlap — same approach GitHub uses.
  let lastLabelled = -2;
  const monthLabels = data.map((week, wi) => {
    const month = week[0].date.getMonth();
    const prevMonth = wi > 0 ? data[wi - 1][0].date.getMonth() : -1;
    if (month !== prevMonth && wi - lastLabelled >= 3) {
      lastLabelled = wi;
      return format(week[0].date, "MMM");
    }
    return "";
  });

  useEffect(() => {
    if (!selected) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  function showTooltip(event: React.MouseEvent<HTMLSpanElement>, cell: HeatmapCell) {
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltip({ x: rect.left + rect.width / 2, y: rect.top, text: tooltipText(cell) });
  }

  function selectDay(event: React.MouseEvent<HTMLSpanElement>, cell: HeatmapCell) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(rect.left + rect.width / 2, 150), window.innerWidth - 150);
    setSelected({ x, y: rect.top, cell });
    setTooltip(null);
  }

  const daySessions = selected
    ? sessions
        .filter((s) => format(parseISO(s.started_at), "yyyy-MM-dd") === format(selected.cell.date, "yyyy-MM-dd"))
        .sort((a, b) => a.started_at.localeCompare(b.started_at))
    : [];

  return (
    <div className="heatmap">
      <div className="heatmap-meta muted">
        <span>{activeDays} active day{activeDays === 1 ? "" : "s"} · {totalMinutes}m total in the last year</span>
        <div className="heatmap-legend" aria-hidden="true">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((b) => <span key={b} className={`heatmap-cell legend h${b}`} />)}
          <span>More</span>
        </div>
      </div>
      <div className="heatmap-grid">
        <div className="heatmap-months">
          {monthLabels.map((label, i) => <span key={i} className="heatmap-month">{label}</span>)}
        </div>
        <div className="heatmap-body" onMouseLeave={() => setTooltip(null)}>
          <div className="heatmap-labels">
            {DAY_LABELS.map((label, i) => <span key={i}>{label}</span>)}
          </div>
          {data.map((week, wi) => (
            <div className="heatmap-col" key={wi}>
              {week.map((cell) => (
                <span
                  key={cell.date.toISOString()}
                  className={`heatmap-cell h${cell.bucket}`}
                  aria-label={tooltipText(cell)}
                  onMouseEnter={(event) => showTooltip(event, cell)}
                  onMouseMove={(event) => showTooltip(event, cell)}
                  onClick={(event) => selectDay(event, cell)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      {tooltip && !selected ? (
        <div className="heatmap-tooltip" role="tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.text}
        </div>
      ) : null}
      {selected ? (
        <>
          <div className="heatmap-popover-backdrop" onClick={() => setSelected(null)} />
          <div
            className="heatmap-popover"
            role="dialog"
            aria-label={`Focus on ${format(selected.cell.date, "EEEE, MMM d, yyyy")}`}
            style={{ left: selected.x, top: selected.y }}
          >
            <p className="heatmap-popover-date">{format(selected.cell.date, "EEEE, MMM d, yyyy")}</p>
            {daySessions.length ? (
              <>
                <p className="heatmap-popover-total muted">{selected.cell.minutes}m focused · {daySessions.length} session{daySessions.length === 1 ? "" : "s"}</p>
                <ul className="heatmap-popover-list">
                  {daySessions.map((session) => (
                    <li key={session.id}>
                      <span className="heatmap-popover-time">{format(parseISO(session.started_at), "h:mm a")}</span>
                      <span className="heatmap-popover-title">{session.title}</span>
                      <span className="heatmap-popover-min muted">{sessionMinutes(session)}m</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="heatmap-popover-total muted">No focus logged this day.</p>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
