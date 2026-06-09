import { format, parseISO } from "date-fns";
import type { HeatmapCell } from "../../services/statsService";
import type { ReviewActivityRow } from "../../db/repositories/types";
import { formatMinutes } from "../../utils/formatTime";
import { Heatmap } from "./Heatmap";

const CARD_CAP_SECONDS = 600;

export function ReviewHeatmap({ data, rows = [] }: { data: HeatmapCell[][]; rows?: ReviewActivityRow[] }) {
  return (
    <Heatmap
      data={data}
      tooltip={(cell) => {
        const date = format(cell.date, "EEEE, MMM d, yyyy");
        return cell.minutes === 0 ? `No reviews on ${date}` : `${formatMinutes(cell.minutes)} reviewing on ${date}`;
      }}
      metaSummary={(activeDays, total) =>
        `${activeDays} review day${activeDays === 1 ? "" : "s"} · ${formatMinutes(total)} total in the last year`}
      dayDetail={(cell) => {
        const day = format(cell.date, "yyyy-MM-dd");
        const dayRows = rows.filter((row) => format(parseISO(row.reviewed_at), "yyyy-MM-dd") === day);
        // Roll the day's cards up per topic so the popover reads "Topic · N× · Mm".
        const byTopic = new Map<string, { title: string; cards: number; seconds: number }>();
        dayRows.forEach((row) => {
          const entry = byTopic.get(row.topic_id) ?? { title: row.topic_title, cards: 0, seconds: 0 };
          entry.cards += 1;
          entry.seconds += Math.min(row.seconds, CARD_CAP_SECONDS);
          byTopic.set(row.topic_id, entry);
        });
        const topics = [...byTopic.values()].sort((a, b) => b.seconds - a.seconds);
        return {
          summary: `${formatMinutes(cell.minutes)} · ${dayRows.length} card${dayRows.length === 1 ? "" : "s"} · ${topics.length} topic${topics.length === 1 ? "" : "s"}`,
          items: topics.map((topic, i) => ({
            key: String(i),
            left: `${topic.cards}×`,
            title: topic.title,
            right: formatMinutes(Math.round(topic.seconds / 60))
          })),
          empty: "No reviews this day."
        };
      }}
    />
  );
}
