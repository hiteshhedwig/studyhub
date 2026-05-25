import { Bar } from "react-chartjs-2";
import { BarElement, CategoryScale, Chart as ChartJS, LinearScale, Tooltip } from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

function cssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function StudyTimeChart({ data }: { data: { label: string; minutes: number }[] }) {
  const accent = cssVar("--accent", "#2dd4bf");
  const axis = cssVar("--text-secondary", "#9aa8b7");
  const grid = cssVar("--border", "#232c38");
  const surface = cssVar("--surface-raised", "#1d2530");
  const text = cssVar("--text-primary", "#e7eef6");

  return (
    <Bar
      data={{
        labels: data.map((item) => item.label),
        datasets: [
          {
            label: "Focused minutes",
            data: data.map((item) => item.minutes),
            backgroundColor: accent,
            hoverBackgroundColor: accent,
            borderRadius: 6,
            maxBarThickness: 28
          }
        ]
      }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: surface,
            titleColor: text,
            bodyColor: axis,
            borderColor: grid,
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
            displayColors: false
          }
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { color: axis } },
          y: { grid: { color: grid }, border: { display: false }, ticks: { color: axis }, beginAtZero: true }
        }
      }}
    />
  );
}
