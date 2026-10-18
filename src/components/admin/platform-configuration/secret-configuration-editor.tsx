"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { mutatePlatformSecretAction, revealPlatformSecretFieldAction } from "@/app/actions/platform-secret";
import type { PublicContract } from "@/lib/admin/platform-configuration/contracts";
import type { SecretStatus, SecretOperation } from "@/lib/admin/platform-configuration/secret-service";
import { ConfigurationField } from "./configuration-field";

const ROTATION_REASONS = [
  { value: "scheduled-rotation", label: "Routine credential replacement" },
  { value: "credential-compromise", label: "Credentials may have been compromised" },
];
const REVOCATION_REASONS = [
  { value: "decommission", label: "Credentials are no longer needed" },
  { value: "credential-compromise", label: "Credentials may have been compromised" },
];

export function SecretConfigurationEditor({ contract, status }: { contract: PublicContract; status: SecretStatus }) {
  const router = useRouter();
  const processing = useRef(false);
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const [revealed, setRevealed] = useState<Record<string, string | number>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [rotationReason, setRotationReason] = useState("");
  const [revocationReason, setRevocationReason] = useState("");
  const [confirmRevocation, setConfirmRevocation] = useState(false);
  const [pending, setPending] = useState(false);
  const [revealingField, setRevealingField] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const changedFields = Object.keys(edits);
  const hasCredentialEdits = changedFields.some((name) =>
    contract.fields.find((field) => field.name === name)?.kind === "secret" && contract.key !== "commerce.bootstrap");
  const operation: SecretOperation = !status.configured ? "set" : hasCredentialEdits ? "rotate" : "update";
  const busy = pending || revealingField !== null;
  const draft = (name: string) => Object.prototype.hasOwnProperty.call(edits, name);

  function resetForm() {
    setEdits({}); setRevealed({}); setVisible({});
    setRotationReason(""); setRevocationReason(""); setConfirmRevocation(false);
  }
  async function reveal(name: string) {
    if (busy) return;
    if (visible[name]) {
      setVisible((current) => ({ ...current, [name]: false }));
      setRevealed((current) => { const next = { ...current }; delete next[name]; return next; });
      return;
    }
    if (draft(name) || !status.configured) {
      setVisible((current) => ({ ...current, [name]: true })); return;
    }
    setRevealingField(name); setResult(null);
    try {
      const response = await revealPlatformSecretFieldAction({ key: contract.key, field: name, expectedVersion: status.version });
      if (response.ok) {
        setRevealed((current) => ({ ...current, [name]: response.value }));
        setVisible((current) => ({ ...current, [name]: true }));
      } else setResult({ ok: false, message: response.message });
    } catch { setResult({ ok: false, message: "Saved value could not be revealed." }); }
    finally { setRevealingField(null); }
  }
  async function runOperation(action: SecretOperation) {
    if (busy || processing.current) return;
    const reason = action === "rotate" ? rotationReason : action === "revoke" ? revocationReason : undefined;
    if (action === "rotate" && !ROTATION_REASONS.some((candidate) => candidate.value === reason) ||
        action === "revoke" && !REVOCATION_REASONS.some((candidate) => candidate.value === reason)) {
      setErrors({ reason: "Choose a reason for this operation." }); return;
    }
    if ((action === "rotate" || action === "revoke") &&
        !window.confirm(`Confirm ${action === "revoke" ? "revocation" : "rotation"} of ${contract.title}?`)) return;
    if (action !== "revoke" && status.configured && changedFields.length === 0) {
      setErrors({ values: "Change at least one field before saving." }); return;
    }
    processing.current = true; setPending(true); setResult(null); setErrors({});
    try {
      // Only edited fields are submitted. The server decrypts, merges, validates
      // and re-encrypts unchanged values atomically at the expected revision.
      const submitted = Object.fromEntries(Object.entries(edits).filter(([key, value]) =>
        !(key === "commandHmacKey" && value === "")));
      const response = await mutatePlatformSecretAction({
        key: contract.key, operation: action, expectedVersion: status.version,
        ...(action === "revoke" ? {} : { values: submitted }),
        ...((action === "rotate" || action === "revoke") ? { reason, confirmation: action.toUpperCase() } : {}),
      });
      if (response.ok) {
        resetForm(); router.refresh();
        setResult({ ok: true, message: `${action === "revoke" ? "Revoked" : "Saved"} revision ${response.version}.` });
      } else setResult({ ok: false, message: response.message });
    } catch { setResult({ ok: false, message: "Secret configuration is temporarily unavailable." }); }
    finally { processing.current = false; setPending(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void runOperation(operation); }

  return <section aria-label={`${contract.title} secret editor`} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
    <h2 className="text-xl font-semibold text-gray-900">{contract.title}</h2>
    <p className="mt-1 text-sm text-gray-600">{contract.description}</p>
    <p className="mt-2 text-sm">Status: <strong>{status.configured ? "Configured" : "Not configured"}</strong> · Revision: <strong>{status.version}</strong> · Updated: {status.updatedAt ? new Date(status.updatedAt).toLocaleString("en-GB") : "Never"}</p>
    <p className="mt-2 text-sm text-gray-600">Use Show to check newly entered or previously saved values. Hidden saved fields are left unchanged when you save. Reveal access is audited separately from revision changes.</p>
    <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
      <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
        {contract.fields.map((field) => <div key={field.name}>
          <ConfigurationField field={field} disabled={busy} error={errors[field.name]}
            secretRequired={!status.configured && !("optional" in field && field.optional)} secretVisible={Boolean(visible[field.name])}
            onToggleSecretVisibility={field.kind === "secret" ? () => { void reveal(field.name); } : undefined}
            value={draft(field.name) ? edits[field.name] : revealed[field.name] ?? ""}
            onChange={(value) => { setEdits((prev) => ({ ...prev, [field.name]: value })); setResult(null); }}/>
          {field.kind !== "secret" && status.configured && !draft(field.name) &&
            <button type="button" className="mt-1 text-xs underline" onClick={() => { void reveal(field.name); }}>
              {revealed[field.name] !== undefined ? "Reload saved value" : "Load saved value"}
            </button>}
          {revealingField === field.name && <span role="status" className="ml-2 text-xs">Retrieving saved value…</span>}
        </div>)}
      </fieldset>
      {errors.values && <p role="alert" className="text-sm text-red-700">{errors.values}</p>}
      {status.configured && operation === "rotate" && <fieldset className="rounded border p-3" disabled={busy}>
        <legend className="font-semibold">Why are you rotating these credentials?</legend>
        {ROTATION_REASONS.map((item) => <label key={item.value} className="mt-2 flex items-center gap-2 text-sm">
          <input type="radio" name="rotationReason" value={item.value} checked={rotationReason === item.value} onChange={() => setRotationReason(item.value)}/>{item.label}
        </label>)}
      </fieldset>}
      {result && <p role={result.ok ? "status" : "alert"} className={`rounded border p-3 text-sm ${result.ok ? "border-green-300" : "border-red-300"}`}>{result.message}</p>}
      {errors.reason && <p role="alert" className="text-sm text-red-700">{errors.reason}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy || status.configured && changedFields.length === 0 || operation === "rotate" && !rotationReason}
          className="rounded bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "Working…" : !status.configured ? "Save configuration" : operation === "rotate" ? "Rotate credentials" : "Save configuration"}
        </button>
        {status.configured && <button type="button" onClick={() => setConfirmRevocation((current) => !current)} disabled={busy}
          className="rounded border border-red-400 px-4 py-2 text-sm text-red-800">Revoke credentials</button>}
        <button type="button" disabled={busy} onClick={() => {
          if (changedFields.length && !window.confirm("Discard unsaved edits?")) return;
          resetForm(); setResult(null); router.refresh();
        }} className="rounded border px-4 py-2 text-sm">Refresh</button>
      </div>
      {status.configured && confirmRevocation && <fieldset disabled={busy} className="rounded border border-red-300 p-4">
        <legend className="font-semibold">Why are you revoking these credentials?</legend>
        {REVOCATION_REASONS.map((item) => <label key={item.value} className="mt-2 flex items-center gap-2 text-sm">
          <input type="radio" name="revocationReason" value={item.value} checked={revocationReason === item.value} onChange={() => setRevocationReason(item.value)}/>{item.label}
        </label>)}
        <button type="button" disabled={busy || !revocationReason} onClick={() => { void runOperation("revoke"); }}
          className="mt-3 rounded bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Confirm revocation</button>
      </fieldset>}
    </form>
  </section>;
}
