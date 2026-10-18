"use client";

import type { FieldContract } from "@/lib/admin/platform-configuration/contracts";

export function ConfigurationField({ field, value, onChange, error, disabled, secretVisible = false, onToggleSecretVisibility, secretRequired = true }: {
  field: FieldContract; value: unknown; onChange: (value: unknown) => void;
  error?: string; disabled: boolean; secretVisible?: boolean; onToggleSecretVisibility?: () => void; secretRequired?: boolean;
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
      <div className="relative">
        <input id={id} type={secretVisible ? "text" : "password"} autoComplete="new-password" maxLength={4096}
          required={secretRequired && field.name !== "commandHmacKey"} disabled={disabled}
          value={typeof value === "string" ? value : ""}
          placeholder={onToggleSecretVisibility ? "Saved value hidden — click Show to reveal" : undefined}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)} aria-describedby={describedBy} className={`${common} pr-20`}/>
        {onToggleSecretVisibility && <button type="button" disabled={disabled}
          aria-label={`${secretVisible ? "Hide" : "Show"} ${field.label}`}
          aria-pressed={secretVisible} title={`${secretVisible ? "Hide" : "Show"} ${field.label}`}
          onClick={onToggleSecretVisibility}
          className="absolute inset-y-0 right-2 mt-1 inline-flex items-center gap-1 rounded px-2 text-xs font-medium text-[var(--brand-800)] hover:bg-gray-100 disabled:opacity-50">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
            {secretVisible ? <><path d="M3 3l18 18"/><path d="M10.6 5.2A11 11 0 0 1 12 5c5.3 0 9 5 9 7a10 10 0 0 1-2.7 3.5"/><path d="M6.3 6.3C3.8 8 3 11 3 12c0 2 3.7 7 9 7 1 0 2-.2 2.9-.5"/></>
              : <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>}
          </svg>
          {secretVisible ? "Hide" : "Show"}
        </button>}
      </div>
    ) : (
      <input id={id} type={field.kind === "string" ? "text" : "url"} disabled={disabled} maxLength={field.maxLength}
        required={field.kind === "nullable-https-url" && field.purpose === "r2" ||
          field.kind === "string" && !("optional" in field && field.optional)}
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
