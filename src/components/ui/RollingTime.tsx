const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** A single odometer-style digit that rolls vertically when its value changes. */
function RollingDigit({ value }: { value: number }) {
  return (
    <span className="roll-digit" aria-hidden="true">
      <span className="roll-track" style={{ transform: `translateY(-${value}em)` }}>
        {DIGITS.map((n) => (
          <span className="roll-cell" key={n}>{n}</span>
        ))}
      </span>
    </span>
  );
}

/**
 * Renders a "MM:SS"-style string where each digit rolls like an iOS timer.
 * Non-digit characters (the colon) render statically. The full string is
 * exposed to assistive tech via aria-label on the wrapper.
 */
export function RollingTime({ time }: { time: string }) {
  return (
    <span className="roll-time" role="text" aria-label={time}>
      {time.split("").map((char, i) =>
        char >= "0" && char <= "9" ? (
          <RollingDigit key={i} value={Number(char)} />
        ) : (
          <span className="roll-colon" key={i} aria-hidden="true">{char}</span>
        )
      )}
    </span>
  );
}
