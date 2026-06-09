import { format, parseISO } from "date-fns";
import { sessionFocusMinutes, type HeatmapCell } from "../../services/statsService";
import type { StudySession } from "../../db/repositories/types";
import { formatMinutes } from "../../utils/formatTime";
import { Heatmap } from "./Heatmap";

// A day with 8h+ (480m) of focus is celebrated with a golden cell, sitting
// above the normal 0–4 intensity ramp regardless of the chosen accent.
const GOLD_THRESHOLD_MINUTES = 480;

export function FocusHeatmap({ data, sessions = [] }: { data: HeatmapCell[][]; sessions?: StudySession[] }) {
  const totalDays = data.flat().length;
  return (
    <Heatmap
      data={data}
      goldThresholdMinutes={GOLD_THRESHOLD_MINUTES}
      tooltip={(cell) => {
        const date = format(cell.date, "EEEE, MMM d, yyyy");
        return cell.minutes === 0 ? `No focus on ${date}` : `${formatMinutes(cell.minutes)} focused on ${date}`;
      }}
      metaSummary={(activeDays, total) =>
        `${activeDays} active day${activeDays === 1 ? "" : "s"} · ${formatMinutes(total)} total over the last ${totalDays} days`}
      dayDetail={(cell) => {
        const day = format(cell.date, "yyyy-MM-dd");
        const daySessions = sessions
          .filter((s) => format(parseISO(s.started_at), "yyyy-MM-dd") === day)
          .sort((a, b) => a.started_at.localeCompare(b.started_at));
        return {
          summary: `${formatMinutes(cell.minutes)} focused · ${daySessions.length} session${daySessions.length === 1 ? "" : "s"}`,
          items: daySessions.map((session) => ({
            key: session.id,
            left: format(parseISO(session.started_at), "h:mm a"),
            title: session.title,
            right: formatMinutes(sessionFocusMinutes(session))
          })),
          empty: "No focus logged this day."
        };
      }}
    />
  );
}
