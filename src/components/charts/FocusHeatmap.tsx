import { format } from "date-fns";
import type { HeatmapCell } from "../../services/statsService";

const DAY_LABELS = ["", "Tue", "", "Thu", "", "Sat", ""]; // Sparse labels to keep things clean.

export function FocusHeatmap({ data }: { data: HeatmapCell[][] }) {
  const totalMinutes = data.flat().reduce((sum, cell) => sum + cell.minutes, 0);
  const activeDays = data.flat().filter((cell) => cell.minutes > 0).length;
  return (
    <div className="heatmap">
      <div className="heatmap-meta muted">
        <span>{activeDays} active day{activeDays === 1 ? "" : "s"} · {totalMinutes}m total</span>
        <div className="heatmap-legend" aria-hidden="true">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((b) => <span key={b} className={`heatmap-cell legend h${b}`} />)}
          <span>More</span>
        </div>
      </div>
      <div className="heatmap-grid">
        <div className="heatmap-labels">
          {DAY_LABELS.map((label, i) => <span key={i}>{label}</span>)}
        </div>
        {data.map((week, wi) => (
          <div className="heatmap-col" key={wi}>
            {week.map((cell) => (
              <span
                key={cell.date.toISOString()}
                className={`heatmap-cell h${cell.bucket}`}
                title={`${format(cell.date, "EEE MMM d")} · ${cell.minutes}m`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
