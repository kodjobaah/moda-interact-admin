"use client";

import { useEffect, useRef } from "react";
import { markdown } from "@codemirror/lang-markdown";
import { basicSetup, EditorView } from "codemirror";

const PROMPT_EDITOR_MIN_HEIGHT = "22rem";

function promptEditorTheme() {
  return EditorView.theme({
    "&": {
      border: "1px solid rgb(209 213 219)",
      borderRadius: "0.375rem",
      backgroundColor: "white",
      fontSize: "0.875rem",
    },
    "&.cm-focused": {
      borderColor: "var(--brand-500)",
      boxShadow: "0 0 0 2px var(--brand-200)",
      outline: "none",
    },
    ".cm-scroller": {
      minHeight: PROMPT_EDITOR_MIN_HEIGHT,
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace",
    },
    ".cm-content": {
      minHeight: PROMPT_EDITOR_MIN_HEIGHT,
      padding: "0.75rem 0",
    },
    ".cm-gutters": {
      backgroundColor: "rgb(249 250 251)",
      borderRight: "1px solid rgb(229 231 235)",
      color: "rgb(107 114 128)",
    },
    ".cm-activeLine, .cm-activeLineGutter": {
      backgroundColor: "rgb(249 250 251)",
    },
  });
}

type PromptCodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  ariaLabel: string;
};

export function PromptCodeEditor({
  value,
  onChange,
  maxLength,
  ariaLabel,
}: PromptCodeEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (!hostRef.current) return undefined;

    const view = new EditorView({
      doc: valueRef.current,
      parent: hostRef.current,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({
          "aria-label": ariaLabel,
          "aria-multiline": "true",
          spellcheck: "true",
        }),
        EditorView.inputHandler.of((editor, from, to, inserted) => {
          const nextLength =
            editor.state.doc.length - (to - from) + inserted.length;
          return nextLength > maxLength;
        }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          onChangeRef.current(update.state.doc.toString());
        }),
        promptEditorTheme(),
      ],
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [ariaLabel, maxLength]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentValue = view.state.doc.toString();
    if (currentValue === value) return;

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: value,
      },
    });
  }, [value]);

  return <div ref={hostRef} data-testid="agent-instructions-prompt-editor" />;
}
