/**
 * Format a minute count for display. Minutes stay as-is while they fit in two
 * digits (0–99m); once they'd be three digits or more we switch to an
 * hours+minutes combination so nothing ever reads like "200m".
 */
export function formatMinutes(total: number): string {
  const rounded = Math.max(0, Math.round(total));
  if (rounded < 100) return `${rounded}m`;
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}
