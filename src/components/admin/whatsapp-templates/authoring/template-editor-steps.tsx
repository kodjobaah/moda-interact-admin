"use client";
import { useRef } from "react";

export type TemplateEditorStep = "setup" | "compose" | "review";
export const TEMPLATE_EDITOR_STEPS: Array<{ key: TemplateEditorStep; label: string }> = [
  { key: "setup", label: "Setup" }, { key: "compose", label: "Compose" }, { key: "review", label: "Review & Save" },
];

/** Accessible roving-focus tabs. All draft state is owned by the parent controller. */
export function TemplateEditorSteps({ value, onChange, issueCount = 0 }: {
  value: TemplateEditorStep; onChange: (value: TemplateEditorStep) => void; issueCount?: number;
}) {
  const controls = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (index: number) => {
    onChange(TEMPLATE_EDITOR_STEPS[index].key);
    controls.current[index]?.focus();
  };
  return <div role="tablist" aria-label="Template editor steps"
    className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 sm:max-w-2xl">
    {TEMPLATE_EDITOR_STEPS.map((tab, i) => <button key={tab.key} ref={(element) => { controls.current[i] = element; }}
      type="button" role="tab" id={`whatsapp-tab-${tab.key}`} aria-controls={`whatsapp-panel-${tab.key}`}
      aria-selected={value === tab.key} tabIndex={value === tab.key ? 0 : -1}
      onClick={() => onChange(tab.key)}
      onKeyDown={(event) => {
        const next = event.key === "ArrowRight" ? (i + 1) % TEMPLATE_EDITOR_STEPS.length
          : event.key === "ArrowLeft" ? (i + TEMPLATE_EDITOR_STEPS.length - 1) % TEMPLATE_EDITOR_STEPS.length
          : event.key === "Home" ? 0 : event.key === "End" ? TEMPLATE_EDITOR_STEPS.length - 1 : null;
        if (next !== null) { event.preventDefault(); move(next); }
      }}
      className={`rounded-lg px-2 py-3 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700 sm:text-sm ${value === tab.key
        ? "bg-white text-blue-900 shadow-sm" : "text-slate-600 hover:bg-white/70"}`}>
      <span className="mr-1 hidden sm:inline">{i + 1}.</span>{tab.label}
      {tab.key === "review" && issueCount > 0 && <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900" aria-label={`${issueCount} validation issues`}>{issueCount}</span>}
    </button>)}
  </div>;
}
