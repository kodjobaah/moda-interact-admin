"use client";

import type { McpExecutionLimits } from "@/lib/admin/mcp-execution-policy";

type Key = keyof McpExecutionLimits;
export type FieldValues = Record<Key, string>;
const FIELDS: { key: Key; title: string; help: string; max: number }[] = [
  { key: "toolDeadlineMs", title: "Tool deadline (milliseconds)", help: "Maximum total time allowed for a single tool execution, including provider operations.", max: 600000 },
  { key: "providerResponseTimeoutMs", title: "Provider response timeout (milliseconds)", help: "Maximum time for one provider response. Must not exceed the tool deadline.", max: 600000 },
  { key: "maxProviderRequests", title: "Maximum provider requests", help: "Maximum external provider requests permitted for one tool execution.", max: 1000 },
  { key: "maxResponseBytes", title: "Maximum response bytes", help: "Maximum serialized response size allowed for a tool result.", max: 16777216 },
];

export function McpExecutionPolicyFields({ values, onChange, disabled }: {
  values: FieldValues;
  onChange: (key: Key, value: string) => void;
  disabled: boolean;
}) {
  return <div className="grid gap-4 sm:grid-cols-2">
    {FIELDS.map((field) => <label key={field.key} className="block text-sm font-medium text-gray-800">
      {field.title}
      <input name={field.key} type="number" required min="1" max={field.max} step="1"
        value={values[field.key]} onChange={(event) => onChange(field.key, event.target.value)}
        disabled={disabled} aria-describedby={`${field.key}-help`}
        className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm" />
      <span id={`${field.key}-help`} className="mt-1 block text-xs font-normal leading-5 text-gray-500">{field.help}</span>
    </label>)}
  </div>;
}
