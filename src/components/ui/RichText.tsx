import Markdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

// NOTE: remark-gfm is intentionally NOT used. Its autolink-literal transform
// relies on a regex lookbehind, which the WebKitGTK engine Tauri uses on Linux
// does not support — it throws "invalid regular expression: invalid group
// specifier name" the instant a RichText renders. Core Markdown (headings,
// bold, lists, code, blockquotes) plus KaTeX math still work without it.

/**
 * ChatGPT commonly emits LaTeX with \( … \) (inline) and \[ … \] (display),
 * which remark-math does not recognise — it wants $ … $ / $$ … $$. Normalise
 * the bracket forms before parsing so both styles render.
 */
function normalizeMath(input: string): string {
  return input
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, body: string) => `\n\n$$\n${body.trim()}\n$$\n\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, body: string) => `$${body.trim()}$`);
}

/**
 * Renders a string as Markdown + LaTeX (KaTeX). Plain text passes through
 * untouched since Markdown is a superset of it. Raw HTML is not rendered
 * (react-markdown default), so this is safe for stored answer content.
 */
export function RichText({ children, className }: { children: string; className?: string }) {
  return (
    <div className={`rich-text${className ? ` ${className}` : ""}`}>
      <Markdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
      >
        {normalizeMath(children)}
      </Markdown>
    </div>
  );
}
