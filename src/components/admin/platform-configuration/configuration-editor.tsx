"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { mutatePlatformConfigurationAction, type ConfigurationActionResult } from "@/app/actions/platform-configuration";
import type { PublicContract } from "@/lib/admin/platform-configuration/contracts";
import type { ConfigurationSnapshot } from "@/lib/admin/platform-configuration/repository";
import { ConfigurationField } from "./configuration-field";

/** Stable initial values are display-only. Reading never patches or writes old documents. */
export function initialConfigurationValues(contract: PublicContract, snapshot: ConfigurationSnapshot): Record<string, unknown> {
  const initial = snapshot.value ?? contract.defaults ?? {};
  return Object.fromEntries(contract.fields.map((field) => [field.name,
    field.kind === "secret" ? "" : (initial[field.name] ?? (field.kind === "nullable-https-url" && field.purpose !== "r2" ? null : ""))]));
}

export function ConfigurationEditor({ contract, snapshot }: { contract: PublicContract; snapshot: ConfigurationSnapshot }) {
  const router = useRouter();
  const processing = useRef(false);
  const [values, setValues] = useState<Record<string, unknown>>(() => initialConfigurationValues(contract, snapshot));
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ConfigurationActionResult | null>(null);
  const original = JSON.stringify(initialConfigurationValues(contract, snapshot));
  const dirty = JSON.stringify(values) !== original;
  const disabled = pending;

  function refresh() {
    if (processing.current) return;
    if (dirty && !window.confirm("Discard unsaved changes and refresh from the database?")) return;
    setResult(null);
    router.refresh();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const button = (event.nativeEvent as SubmitEvent).submitter;
    const operation = button instanceof HTMLButtonElement && button.value === "reset" ? "reset" : "save";
    if (processing.current || disabled || operation === "reset" && !contract.canReset) return;
    if (operation === "reset" && !window.confirm("Replace this policy with its approved defaults? This creates a new audited revision.")) return;
    processing.current = true;
    setPending(true);
    setResult(null);
    try {
      const response = await mutatePlatformConfigurationAction(operation, {
        key: contract.key, expectedVersion: snapshot.version,
        ...(operation === "save" ? { values } : {}), reason,
      });
      setResult(response);
      if (response.ok) { setReason(""); router.refresh(); }
    } catch {
      setResult({ ok: false, code: "DB_UNAVAILABLE", message: "Could not save policy. Refresh and retry." });
    } finally { processing.current = false; setPending(false); }
  }

  return <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" aria-label={`${contract.title} editor`}>
    <h2 className="text-xl font-semibold text-gray-900">{contract.title}</h2>
    <p className="mt-1 text-sm text-gray-600">{contract.description}</p>
    <dl className="my-4 grid gap-2 rounded-md bg-gray-50 p-3 text-sm sm:grid-cols-3">
      <div><dt className="text-gray-500">Revision</dt><dd className="font-semibold">{snapshot.version || "Not configured"}</dd></div>
      <div><dt className="text-gray-500">Updated at</dt><dd>{snapshot.updatedAt ? new Date(snapshot.updatedAt).toLocaleString("en-GB") : "Never"}</dd></div>
      <div><dt className="text-gray-500">Last actor</dt><dd className="break-words font-mono text-xs">{snapshot.updatedBy ?? "—"}</dd></div>
    </dl>
    {snapshot.invalidStoredValue && <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Stored policy is missing a required field or contains invalid data. Refresh after repairing the versioned document; Review all fields and save a complete validated replacement; the existing version is preserved until Save.</p>}
    {snapshot.version === 0 && !contract.defaults && <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Not configured. All required values must be supplied before the first save; no placeholders are persisted.</p>}
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={disabled} className="space-y-4 disabled:opacity-70">
        {contract.fields.map((field) => <ConfigurationField key={field.name} field={field} value={values[field.name]} disabled={disabled}
          error={result && !result.ok ? result.fieldErrors?.[field.name] : undefined}
          onChange={(value) => { setValues((previous) => ({ ...previous, [field.name]: value })); setResult(null); }} />)}
        <label htmlFor="config-reason" className="block text-sm font-semibold text-gray-900">Audit reason (optional)</label>
        <textarea id="config-reason" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-md border border-gray-300 p-2 text-sm" rows={2} />
      </fieldset>
      {result && <div role={result.ok ? "status" : "alert"} className={`rounded-md border p-3 text-sm ${result.ok ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
        {result.ok ? `Saved revision ${result.version}.` : result.message}
        {!result.ok && result.code === "CONFLICT" && <button type="button" onClick={refresh} className="ml-3 underline">Reload latest revision</button>}
      </div>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" value="save" disabled={disabled} className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Working…" : "Save changes"}</button>
        {contract.canReset && <button type="submit" formNoValidate value="reset" disabled={disabled} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Reset to approved defaults</button>}
        <button type="button" onClick={refresh} disabled={pending} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Refresh</button>
      </div>
    </form>
  </section>;
}
