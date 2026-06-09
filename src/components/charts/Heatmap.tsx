import { useEffect, useState } from "react";
import { format } from "date-fns";
import type { HeatmapCell } from "../../services/statsService";

// Sparse weekday labels (Sun→Sat rows), GitHub shows Mon/Wed/Fri.
const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

export type DayDetailItem = { key: string; left: string; title: string; right: string };
export type DayDetail = { summary: string; items: DayDetailItem[]; empty: string };

type Tooltip = { x: number; y: number; text: string };
type Selected = { x: number; y: number; cell: HeatmapCell };

export type HeatmapProps = {
  data: HeatmapCell[][];
  /** Days at/above this many minutes get a celebratory gold cell + legend swatch. Omit to disable. */
  goldThresholdMinutes?: number;
  tooltip: (cell: HeatmapCell) => string;
  metaSummary: (activeDays: number, totalMinutes: number) => string;
  dayDetail: (cell: HeatmapCell) => DayDetail;
};

/**
 * GitHub-style contribution grid. Presentational only — what each cell means
 * (focus minutes, review minutes, …) is decided by the caller via the tooltip /
 * meta / dayDetail callbacks, so one component backs every heatmap variant.
 */
export function Heatmap({ data, goldThresholdMinutes, tooltip, metaSummary, dayDetail }: HeatmapProps) {
  const [hovered, setHovered] = useState<Tooltip | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  const cells = data.flat();
  const totalMinutes = cells.reduce((sum, cell) => sum + cell.minutes, 0);
  const activeDays = cells.filter((cell) => cell.minutes > 0).length;
  const showGold = typeof goldThresholdMinutes === "number";

  // Month label sits above the first week-column of each month, suppressing
  // labels too close to the previous one so they don't overlap (as GitHub does).
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
    setHovered({ x: rect.left + rect.width / 2, y: rect.top, text: tooltip(cell) });
  }

  function selectDay(event: React.MouseEvent<HTMLSpanElement>, cell: HeatmapCell) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(rect.left + rect.width / 2, 150), window.innerWidth - 150);
    setSelected({ x, y: rect.top, cell });
    setHovered(null);
  }

  const detail = selected ? dayDetail(selected.cell) : null;

  return (
    <div className="heatmap">
      <div className="heatmap-meta muted">
        <span>{metaSummary(activeDays, totalMinutes)}</span>
        <div className="heatmap-legend" aria-hidden="true">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((b) => <span key={b} className={`heatmap-cell legend h${b}`} />)}
          <span>More</span>
          {showGold ? (
            <>
              <span className="heatmap-cell legend gold" />
              <span>{Math.round(goldThresholdMinutes / 60)}h+</span>
            </>
          ) : null}
        </div>
      </div>
      <div className="heatmap-grid">
        <div className="heatmap-months">
          {monthLabels.map((label, i) => <span key={i} className="heatmap-month">{label}</span>)}
        </div>
        <div className="heatmap-body" onMouseLeave={() => setHovered(null)}>
          <div className="heatmap-labels">
            {DAY_LABELS.map((label, i) => <span key={i}>{label}</span>)}
          </div>
          {data.map((week, wi) => (
            <div className="heatmap-col" key={wi}>
              {week.map((cell) => (
                <span
                  key={cell.date.toISOString()}
                  className={`heatmap-cell h${cell.bucket}${showGold && cell.minutes >= goldThresholdMinutes ? " gold" : ""}`}
                  aria-label={tooltip(cell)}
                  onMouseEnter={(event) => showTooltip(event, cell)}
                  onMouseMove={(event) => showTooltip(event, cell)}
                  onClick={(event) => selectDay(event, cell)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      {hovered && !selected ? (
        <div className="heatmap-tooltip" role="tooltip" style={{ left: hovered.x, top: hovered.y }}>
          {hovered.text}
        </div>
      ) : null}
      {selected && detail ? (
        <>
          <div className="heatmap-popover-backdrop" onClick={() => setSelected(null)} />
          <div
            className="heatmap-popover"
            role="dialog"
            aria-label={format(selected.cell.date, "EEEE, MMM d, yyyy")}
            style={{ left: selected.x, top: selected.y }}
          >
            <p className="heatmap-popover-date">{format(selected.cell.date, "EEEE, MMM d, yyyy")}</p>
            {detail.items.length ? (
              <>
                <p className="heatmap-popover-total muted">{detail.summary}</p>
                <ul className="heatmap-popover-list">
                  {detail.items.map((item) => (
                    <li key={item.key}>
                      <span className="heatmap-popover-time">{item.left}</span>
                      <span className="heatmap-popover-title">{item.title}</span>
                      <span className="heatmap-popover-min muted">{item.right}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="heatmap-popover-total muted">{detail.empty}</p>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
