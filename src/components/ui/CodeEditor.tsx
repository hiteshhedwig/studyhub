import { useEffect, useRef } from "react";
import { EditorView, lineNumbers, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { python, localCompletionSource, globalCompletion } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, indentOnInput } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { numpyCompletionSource } from "../../services/numpyCompletions";

type Props = {
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  autoComplete?: boolean;
  minHeight?: number;
};

// Custom theme overlay to match app styles
const appTheme = EditorView.theme({
  "&": {
    fontSize: "13.5px",
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    borderRadius: "8px",
    overflow: "hidden"
  },
  ".cm-scroller": {
    minHeight: "var(--cm-min-height, 200px)",
    lineHeight: "1.65"
  },
  ".cm-content": { padding: "12px 4px" },
  ".cm-line": { paddingLeft: "8px" },
  ".cm-gutters": { borderRight: "1px solid rgba(255,255,255,0.06)", paddingRight: "4px" },
  "&.cm-focused .cm-cursor": { borderLeftColor: "var(--accent, #5eead4)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": { background: "rgba(94,234,212,0.15)" }
});

export function CodeEditor({ value, onChange, readOnly = false, autoComplete = true, minHeight = 220 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Create editor once on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const extensions = [
      oneDark,
      appTheme,
      python(),
      lineNumbers(),
      bracketMatching(),
      indentOnInput(),
      closeBrackets(),
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, indentWithTab]),
      EditorView.lineWrapping,
      EditorView.editable.of(!readOnly)
    ];

    if (autoComplete && !readOnly) {
      extensions.push(
        autocompletion({
          // Merge numpy-specific, local-identifier, and Python-builtin sources
          override: [numpyCompletionSource, localCompletionSource, globalCompletion],
          activateOnTyping: true,
          closeOnBlur: false,
        }),
        keymap.of(completionKeymap)
      );
    }

    if (!readOnly) {
      extensions.push(
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current?.(update.state.doc.toString());
          }
        })
      );
    }

    const state = EditorState.create({ doc: value, extensions });
    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Intentionally only run on mount — external value changes handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, autoComplete]);

  // Sync external `value` changes (e.g., reset to starter code)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="code-editor-wrap"
      style={{ "--cm-min-height": `${minHeight}px` } as React.CSSProperties}
    />
  );
}
