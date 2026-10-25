"use client";

import { useEffect, useId, useRef } from "react";
import { formatEditorNodes, insertEditorToken, parseEditorNodes } from "@/lib/admin/whatsapp-templates/authoring/draft-operations";
import type { AuthoringIssue, SemanticVariable, WrapperNode } from "@/lib/admin/whatsapp-templates/authoring/types";
import { TemplateVariablePalette } from "./template-variable-palette";

/** Edit a single text/variable stream without exposing individual AST node rows. */
export function TemplateInlineEditor({ title, nodes, onChange, variables = [], allowResponseSlot = false, issues = [], rows = 2, helpText }: {
  title: string;
  nodes: WrapperNode[];
  onChange: (next: WrapperNode[]) => void;
  variables?: readonly SemanticVariable[];
  allowResponseSlot?: boolean;
  issues?: AuthoringIssue[];
  rows?: number;
  helpText?: string;
}) {
  const id = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const caret = useRef<number | null>(null);
  const value = formatEditorNodes(nodes);
  useEffect(() => {
    if (caret.current === null || !input.current) return;
    input.current.focus();
    input.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [value]);
  const update = (next: string) => onChange(parseEditorNodes(next, { variables, allowResponseSlot }));
  const insert = (name: SemanticVariable | "response.body") => {
    const start = input.current?.selectionStart ?? value.length;
    const end = input.current?.selectionEnd ?? start;
    const next = insertEditorToken(value, name, start, end);
    caret.current = next.caret;
    update(next.text);
    // If a disabled field produced no state change, still restore focus.
    input.current?.focus();
  };
  return <section className="space-y-2" aria-label={`${title} editor`}>
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={id} className="block text-sm font-semibold text-slate-900">{title}</label>
      <span className="text-xs text-slate-500">{title === "Body" ? "Required" : "Optional"}</span>
    </div>
    <textarea id={id} aria-label={`${title} message`} rows={rows} value={value}
      aria-invalid={issues.length > 0} aria-describedby={issues.length ? `${id}-issues` : undefined}
      onChange={(event) => update(event.target.value)}
      placeholder={title === "Body" ? "Write your message..." : `Add optional ${title.toLowerCase()} text...`}
      className={`w-full resize-y rounded-lg border bg-white px-3 py-3 text-sm leading-6 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 ${issues.length ? "border-amber-500" : "border-slate-300"}`} />
    {helpText && <p className="text-xs text-slate-500">{helpText}</p>}
    {allowResponseSlot && <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-600">Required response.body slot</span>
      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insert("response.body")}
        disabled={nodes.some((node) => node.type === "slot")}
        className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60">
        {nodes.some((node) => node.type === "slot") ? "Response: response.body (required) ✓" : "+ Insert response.body"}
      </button>
    </div>}
    <TemplateVariablePalette variables={variables} onInsert={insert} />
    {issues.length > 0 && <ul id={`${id}-issues`} role="alert" className="space-y-1 text-xs text-amber-800">
      {issues.map((issue, index) => <li key={index}>{issue.message}</li>)}
    </ul>}
  </section>;
}
