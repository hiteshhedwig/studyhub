import { useEffect, useRef, useState } from "react";
import { Calculator as CalculatorIcon, X } from "lucide-react";

/**
 * A tiny, dependency-free arithmetic evaluator. Recursive-descent so operator
 * precedence and unary minus fall out naturally; never uses eval(). Supports
 * + - * /, parentheses, and decimals. Throws on anything malformed.
 */
type Token = { type: "num"; value: number } | { type: "op"; value: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === " ") {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let num = "";
      while (i < input.length && /[0-9.]/.test(input[i])) {
        num += input[i];
        i += 1;
      }
      if ((num.match(/\./g) ?? []).length > 1) throw new Error("bad number");
      tokens.push({ type: "num", value: Number(num) });
      continue;
    }
    if ("+-*/()".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i += 1;
      continue;
    }
    throw new Error(`unexpected "${ch}"`);
  }
  return tokens;
}

function evaluate(expr: string): number {
  // Normalise the pretty display glyphs back to ASCII operators.
  const tokens = tokenize(expr.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-"));
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = () => tokens[pos++];

  function parseExpression(): number {
    let left = parseTerm();
    while (peek()?.type === "op" && (peek().value === "+" || peek().value === "-")) {
      const op = eat().value;
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }
  function parseTerm(): number {
    let left = parseFactor();
    while (peek()?.type === "op" && (peek().value === "*" || peek().value === "/")) {
      const op = eat().value;
      const right = parseFactor();
      left = op === "*" ? left * right : left / right;
    }
    return left;
  }
  function parseFactor(): number {
    const token = peek();
    if (!token) throw new Error("unexpected end");
    if (token.type === "op" && (token.value === "+" || token.value === "-")) {
      eat();
      const value = parseFactor();
      return token.value === "-" ? -value : value;
    }
    if (token.type === "op" && token.value === "(") {
      eat();
      const value = parseExpression();
      if (peek()?.value !== ")") throw new Error("missing )");
      eat();
      return value;
    }
    if (token.type === "num") {
      eat();
      return token.value;
    }
    throw new Error("unexpected token");
  }

  const result = parseExpression();
  if (pos !== tokens.length) throw new Error("trailing input");
  if (!Number.isFinite(result)) throw new Error("not finite");
  return result;
}

/** Trim floating-point noise (0.1 + 0.2 → 0.3) without forcing scientific notation. */
function format(value: number): string {
  return String(Number.parseFloat(value.toFixed(10)));
}

const KEYS = [
  ["AC", "(", ")", "÷"],
  ["7", "8", "9", "×"],
  ["4", "5", "6", "−"],
  ["1", "2", "3", "+"],
  ["0", ".", "⌫", "="]
] as const;

const GLYPH_BY_KEY: Record<string, string> = { "/": "÷", "*": "×", "-": "−" };

export function Calculator() {
  const [open, setOpen] = useState(false);
  const [expr, setExpr] = useState("");
  const [error, setError] = useState(false);
  // After "=" the next digit starts fresh, but an operator continues from the result.
  const justEvaluated = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Alt+C toggles the calculator from anywhere (Alt avoids clobbering normal typing).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.altKey && (event.key === "c" || event.key === "C")) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Focus the panel when it opens so its key handler catches math keystrokes
  // without hijacking typing elsewhere in the app.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  function press(key: string) {
    setError(false);
    if (key === "AC") {
      setExpr("");
      justEvaluated.current = false;
      return;
    }
    if (key === "⌫") {
      setExpr((value) => value.slice(0, -1));
      justEvaluated.current = false;
      return;
    }
    if (key === "=") {
      if (!expr) return;
      try {
        setExpr(format(evaluate(expr)));
        justEvaluated.current = true;
      } catch {
        setError(true);
      }
      return;
    }
    const isOperator = "+−×÷".includes(key);
    setExpr((value) => {
      if (justEvaluated.current) {
        justEvaluated.current = false;
        // Keep the result as the left operand if continuing with an operator;
        // otherwise start a brand-new expression.
        return isOperator ? value + key : key;
      }
      return value + key;
    });
  }

  function onPanelKeyDown(event: React.KeyboardEvent) {
    const { key } = event;
    if (key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (/[0-9.()]/.test(key) && key.length === 1) {
      event.preventDefault();
      press(key);
    } else if (key in GLYPH_BY_KEY) {
      event.preventDefault();
      press(GLYPH_BY_KEY[key]);
    } else if (key === "+") {
      event.preventDefault();
      press("+");
    } else if (key === "Enter" || key === "=") {
      event.preventDefault();
      press("=");
    } else if (key === "Backspace") {
      event.preventDefault();
      press("⌫");
    } else if ((key === "c" || key === "C" || key === "Delete") && !event.altKey) {
      event.preventDefault();
      press("AC");
    }
  }

  // A faint running total as you type — only when the expression parses cleanly
  // and isn't already just the evaluated result.
  let preview = "";
  if (expr && !justEvaluated.current && !error) {
    try {
      const value = format(evaluate(expr));
      if (value !== expr) preview = value;
    } catch {
      preview = "";
    }
  }

  return (
    <>
      <button
        type="button"
        className={`calc-fab${open ? " active" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Close calculator" : "Open calculator (Alt+C)"}
        title="Calculator (Alt+C)"
      >
        {open ? <X size={18} /> : <CalculatorIcon size={18} />}
      </button>
      {open ? (
        <div
          className="calc-panel"
          role="dialog"
          aria-label="Calculator"
          ref={panelRef}
          tabIndex={-1}
          onKeyDown={onPanelKeyDown}
        >
          <div className="calc-display">
            <span className="calc-expr">{error ? "Error" : expr || "0"}</span>
            <span className="calc-preview">{preview ? `= ${preview}` : ""}</span>
          </div>
          <div className="calc-keys">
            {KEYS.flat().map((key) => (
              <button
                type="button"
                key={key}
                className={`calc-key${"+−×÷".includes(key) ? " op" : ""}${key === "=" ? " equals" : ""}${key === "AC" ? " clear" : ""}`}
                onClick={() => press(key)}
                tabIndex={-1}
              >
                {key}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
