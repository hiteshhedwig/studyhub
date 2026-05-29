type DiffPart = { type: "same" | "add" | "del"; value: string };

/**
 * Line-level diff via longest-common-subsequence. Small and dependency-free
 * (no fancy regex), so it's safe on the older WebKit engine Tauri uses. Texts
 * here are short (a question/answer), so the O(m·n) table is fine.
 */
function lineDiff(before: string, after: string): DiffPart[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ type: "same", value: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "del", value: a[i] });
      i++;
    } else {
      out.push({ type: "add", value: b[j] });
      j++;
    }
  }
  while (i < m) out.push({ type: "del", value: a[i++] });
  while (j < n) out.push({ type: "add", value: b[j++] });
  return out;
}

export function DiffView({ before, after }: { before: string; after: string }) {
  const parts = lineDiff(before, after);
  return (
    <div className="diff" role="figure" aria-label="Before and after changes">
      {parts.map((part, index) => (
        <div className={`diff-line ${part.type}`} key={index}>
          <span className="diff-sign" aria-hidden="true">{part.type === "add" ? "+" : part.type === "del" ? "-" : " "}</span>
          <span className="diff-line-text">{part.value || " "}</span>
        </div>
      ))}
    </div>
  );
}
