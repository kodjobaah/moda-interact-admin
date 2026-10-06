"use client";

import { useMemo, useRef } from "react";
import {
  createStoreCategoryPromptConditionBlock,
  validateStoreCategoryPromptTemplate,
} from "@modainteract/moda-interact-shared/commerce";

export type StoreCategoryPromptCondition = {
  id: string;
  displayName: string;
  conditionKey: string;
};

export function StoreCategoryPromptConditionEditor({
  promptText,
  onChange,
  conditions,
  textareaClassName,
  textareaName,
  rows = 18,
  disabled = false,
}: {
  promptText: string;
  onChange: (value: string) => void;
  conditions: StoreCategoryPromptCondition[];
  textareaClassName: string;
  textareaName?: string;
  rows?: number;
  disabled?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const availableConditionKeys = useMemo(
    () => conditions.map((condition) => condition.conditionKey),
    [conditions],
  );
  const validation = useMemo(
    () =>
      validateStoreCategoryPromptTemplate({
        source: promptText,
        availableConditionKeys,
      }),
    [availableConditionKeys, promptText],
  );

  function insertCondition(conditionKey: string) {
    const textarea = textareaRef.current;
    const block = createStoreCategoryPromptConditionBlock(conditionKey);
    const start = textarea?.selectionStart ?? promptText.length;
    const end = textarea?.selectionEnd ?? start;
    const prefix = promptText.slice(0, start);
    const suffix = promptText.slice(end);
    const leading = prefix && !prefix.endsWith("\n") ? "\n" : "";
    const trailing = suffix && !suffix.startsWith("\n") ? "\n" : "";
    const next = `${prefix}${leading}${block}${trailing}${suffix}`;
    onChange(next);
    queueMicrotask(() => {
      if (!textarea) return;
      const cursor = prefix.length + leading.length + block.indexOf("\n") + 1;
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h4 className="text-sm font-semibold text-gray-900">
          Available mapping conditions
        </h4>
        <p className="mt-1 text-xs leading-5 text-gray-600">
          Mapping conditions are evaluated when a merchant chooses this Store Category.
          Insert a bounded conditional block to include prompt instructions only when that
          mapping is selected.
        </p>
        {conditions.length === 0 ? (
          <p className="mt-4 rounded-md bg-white p-3 text-sm text-gray-600">
            No mapping conditions are configured. This prompt will be unconditional.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {conditions.map((condition) => (
              <li key={condition.id} className="rounded-md border border-gray-200 bg-white p-3">
                <p className="text-sm font-medium text-gray-900">
                  {condition.displayName}
                </p>
                <p className="mt-1 break-all font-mono text-xs text-gray-500">
                  mappings.{condition.conditionKey}
                </p>
                <button
                  type="button"
                  className="mt-2 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={disabled}
                  onClick={() => insertCondition(condition.conditionKey)}
                >
                  Insert condition
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="min-w-0">
        <textarea
          ref={textareaRef}
          className={textareaClassName}
          name={textareaName}
          value={promptText}
          maxLength={100_000}
          rows={rows}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Describe how CommerceAgent should support customers in this Store Category. Use the available mapping conditions for specialization."
          required
        />
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`rounded-full px-2 py-1 font-semibold ${
              validation.valid
                ? "bg-green-100 text-green-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {validation.valid ? "Conditional prompt valid" : "Prompt needs attention"}
          </span>
          {validation.referencedConditionKeys.length > 0 ? (
            <span className="text-gray-500">
              Uses {validation.referencedConditionKeys.length} mapping condition
              {validation.referencedConditionKeys.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        {!validation.valid ? (
          <ul className="mt-2 space-y-1 text-sm text-amber-800" role="status">
            {validation.issues.map((entry, index) => (
              <li key={`${entry.code}-${index}`}>• {entry.message}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
