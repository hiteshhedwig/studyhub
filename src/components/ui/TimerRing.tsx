import { RollingTime } from "./RollingTime";

type TimerRingProps = {
  /** progress 0-100 */
  progress: number;
  time: string;
  label: string;
  /** visual state for ring color */
  state?: "focus" | "break" | "paused";
};

const SIZE = 240;
const STROKE = 12;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function TimerRing({ progress, time, label, state = "focus" }: TimerRingProps) {
  const clamped = Math.max(0, Math.min(100, progress));
  const offset = CIRCUMFERENCE * (1 - clamped / 100);
  return (
    <div className={`timer-ring ${state}`} role="timer" aria-live="polite">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} aria-hidden="true">
        <circle className="ring-track" cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} />
        <circle
          className="ring-progress"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="timer-ring-inner">
        <span className="timer"><RollingTime time={time} /></span>
        <span className="timer-ring-label">{label}</span>
      </div>
    </div>
  );
}
