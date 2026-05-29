import { useEffect, useRef, useState } from "react";

/**
 * Animates a number from its previous value up to `value` (easeOutCubic).
 * Starts from 0 on mount, so stats "tick up" into place. Honors
 * prefers-reduced-motion by snapping straight to the value.
 */
export function CountUp({
  value,
  duration = 650,
  format
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
}) {
  const [display, setDisplay] = useState(0);
  const displayRef = useRef(0);

  useEffect(() => {
    const from = displayRef.current;
    const to = value;
    if (from === to) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      displayRef.current = to;
      setDisplay(to);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (to - from) * eased);
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{format ? format(display) : display}</>;
}
