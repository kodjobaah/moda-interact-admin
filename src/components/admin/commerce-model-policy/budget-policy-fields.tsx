"use client";

import { COMMERCE_MODEL_BUDGET_FIELDS, type CommerceBudgetFieldErrors, type CommerceBudgetKey } from "@/lib/admin/commerce-model-policy-fields";

type BudgetValue = Partial<Record<CommerceBudgetKey, string>>;

/** Reusable LIVE Admin budget fields; optional scopes omit unchecked JSON keys. */
export function BudgetPolicyFields({
  values, onChange, optional = false, overrides, onOverrideChange, inherited, fieldErrors = {}, disabled = false,
}: {
  values: BudgetValue;
  onChange: (key: CommerceBudgetKey, value: string) => void;
  optional?: boolean;
  overrides?: Partial<Record<CommerceBudgetKey, boolean>>;
  onOverrideChange?: (key: CommerceBudgetKey, enabled: boolean) => void;
  inherited?: Partial<Record<CommerceBudgetKey, { value: number; source: string }>>;
  fieldErrors?: CommerceBudgetFieldErrors;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {COMMERCE_MODEL_BUDGET_FIELDS.map((field) => {
        const enabled = !optional || (overrides?.[field.key] ?? false);
        return (
          <div key={field.key} className="min-w-0 rounded-md border border-gray-200 p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <label htmlFor={`commerce-budget-${field.key}`} className="text-sm font-semibold text-gray-800">{field.label}</label>
              {optional ? (
                <label className="flex items-center gap-2 text-xs text-gray-700">
                  <input type="checkbox" checked={enabled} disabled={disabled} onChange={(event) => onOverrideChange?.(field.key, event.target.checked)}/>
                  Override
                </label>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <input
                id={`commerce-budget-${field.key}`}
                name={enabled ? field.key : undefined}
                type="number" min="1" step="1" inputMode="numeric"
                value={enabled ? (values[field.key] ?? "") : ""}
                disabled={disabled || !enabled}
                aria-invalid={Boolean(fieldErrors[field.key])}
                aria-describedby={`commerce-budget-${field.key}-help`}
                required={enabled}
                onChange={(event) => onChange(field.key, event.target.value)}
                className="w-full min-w-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--brand-500)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-200)] disabled:bg-gray-100"
              />
              <span className="text-xs text-gray-500">{field.unit}</span>
            </div>
            {field.key === "deadlineMs" && enabled && /^\d+$/.test(values.deadlineMs ?? "") ? (
              <p className="mt-1 text-xs text-gray-500">{(Number(values.deadlineMs) / 1000).toLocaleString()} seconds</p>
            ) : null}
            <p id={`commerce-budget-${field.key}-help`} className="mt-2 text-xs leading-5 text-gray-600">{field.description}</p>
            {optional && !enabled && inherited?.[field.key] ? (
              <p className="mt-2 text-xs text-gray-700">Inherits {inherited[field.key]?.value} from {inherited[field.key]?.source}</p>
            ) : null}
            {fieldErrors[field.key] ? <p role="alert" className="mt-2 text-xs text-red-700">{fieldErrors[field.key]}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
