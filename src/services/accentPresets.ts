/**
 * Accent presets selectable in Settings. The `id` is written to the
 * `data-accent` attribute on <html>; the actual colors live in
 * src/styles/accents.css keyed by that id. `swatch` is only for rendering the
 * picker chip (a representative dark-theme color).
 */
export type AccentId = "teal" | "blue" | "green" | "violet" | "rosewood";

export type AccentPreset = { id: AccentId; label: string; swatch: string };

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: "teal", label: "Teal", swatch: "#46b6a6" },
  { id: "blue", label: "Calm Blue", swatch: "#5b8fd6" },
  { id: "green", label: "Sage", swatch: "#6aa97f" },
  { id: "violet", label: "Violet", swatch: "#9b87d6" },
  { id: "rosewood", label: "Rosewood", swatch: "#b47b96" }
];

export const DEFAULT_ACCENT: AccentId = "teal";

export function isAccentId(value: string | null | undefined): value is AccentId {
  return ACCENT_PRESETS.some((preset) => preset.id === value);
}
