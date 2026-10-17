"use client";

import type { FieldContract } from "@/lib/admin/platform-configuration/contracts";

export function ConfigurationField({ field, value, onChange, error, disabled }: {
  field: FieldContract; value: unknown; onChange: (value: unknown) => void;
  error?: string; disabled: boolean;
}) {
  const id = `config-${field.name}`;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy = error ? `${helpId} ${errorId}` : helpId;
  const common = "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-2 focus:outline-offset-1 focus:outline-[var(--brand-700)] disabled:bg-gray-100";
  return <div className="space-y-1">
    <label htmlFor={id} className="block text-sm font-semibold text-gray-900">{field.label}{field.kind === "integer" && field.unit ? ` (${field.unit})` : ""}</label>
    {field.kind === "integer" ? (
      <input id={id} type="number" inputMode="numeric" step="1" min={field.min} max={field.max} required
        value={value === null || value === undefined ? "" : String(value)} disabled={disabled}
        aria-invalid={Boolean(error)} aria-describedby={describedBy}
        onChange={(event) => {
          const raw = event.target.value;
          // Preserve incomplete edit as an invalid value; server revalidates strict numeric types.
          onChange(raw !== "" && /^[0-9]+$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : raw);
        }} className={common}/>
    ) : field.kind === "enum" ? (
      <select id={id} required disabled={disabled} value={typeof value === "string" ? value : ""}
        aria-invalid={Boolean(error)} aria-describedby={describedBy} onChange={(event) => onChange(event.target.value)} className={common}>
        <option value="">Choose a provider</option>
        {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    ) : field.kind === "boolean" ? (
      <select id={id} required disabled={disabled} value={typeof value === "boolean" ? String(value) : ""}
        aria-invalid={Boolean(error)} aria-describedby={describedBy} onChange={(event) => onChange(event.target.value === "true") } className={common}>
        <option value="">Choose a value</option><option value="true">Enabled</option><option value="false">Disabled</option>
      </select>
    ) : field.kind === "secret" ? (
      <input id={id} type="password" autoComplete="new-password" readOnly disabled value="" placeholder="Managed separately"
        aria-describedby={describedBy} className={common}/>
    ) : (
      <input id={id} type={field.kind === "string" ? "text" : "url"} disabled={disabled} maxLength={field.maxLength}
        required={field.kind === "nullable-https-url" && field.purpose === "r2" || field.kind === "string"}
        value={typeof value === "string" ? value : ""}
        placeholder={field.kind === "nullable-https-url" && field.purpose !== "r2" ? "Not configured" : undefined}
        aria-invalid={Boolean(error)} aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value === "" && field.kind === "nullable-https-url" && field.purpose !== "r2" ? null : event.target.value)}
        className={common}/>
    )}
    <p id={helpId} className="text-xs text-gray-600">{field.description}</p>
    {error && <p id={errorId} role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
