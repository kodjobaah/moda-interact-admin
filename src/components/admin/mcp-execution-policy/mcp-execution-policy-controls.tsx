"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { mutateMcpExecutionPolicyAction, type McpPolicyActionResult } from "@/app/actions/mcp-execution-policy";
import { MCP_ENVIRONMENTS, type McpEnvironment, type McpExecutionPolicyDocument } from "@/lib/admin/mcp-execution-policy";
import { McpExecutionPolicyFields, type FieldValues } from "./mcp-execution-policy-fields";

function toFields(entry: McpExecutionPolicyDocument["environments"][McpEnvironment]): FieldValues {
  return {
    toolDeadlineMs: entry ? String(entry.toolDeadlineMs) : "",
    providerResponseTimeoutMs: entry ? String(entry.providerResponseTimeoutMs) : "",
    maxProviderRequests: entry ? String(entry.maxProviderRequests) : "",
    maxResponseBytes: entry ? String(entry.maxResponseBytes) : "",
  };
}

export function McpExecutionPolicyControls({ version, document, error }: {
  version: number | null;
  document: McpExecutionPolicyDocument | null;
  error: string | null;
}) {
  const router = useRouter();
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [environment, setEnvironment] = useState<McpEnvironment>("DEVELOPMENT");
  const [values, setValues] = useState<FieldValues>(() => toFields(document?.environments.DEVELOPMENT));
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<McpPolicyActionResult | null>(null);
  const configured = document?.environments[environment] ?? null;
  const editable = version !== null && Boolean(document) && !error;

  function chooseEnvironment(next: McpEnvironment) {
    if (submitting.current) return;
    setEnvironment(next);
    setValues(toFields(document?.environments[next]));
    setResult(null);
    setReason("");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const operation = submitter instanceof HTMLButtonElement && submitter.value === "clear" ? "clear" : "save";
    event.preventDefault();
    if (submitting.current || !editable || (operation === "clear" && !configured)) return;
    submitting.current = true;
    setPending(true);
    setResult(null);
    try {
      const form = new FormData(event.currentTarget);
      form.set("operation", operation);
      const response = await mutateMcpExecutionPolicyAction(form);
      setResult(response);
      if (response.ok) { setReason(""); router.refresh(); }
    } catch {
      setResult({ ok: false, message: "Could not update MCP policy. Reload and retry." });
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  // The native submitter selects the operation synchronously; state updates cannot race it.
  return <section className="mt-8 rounded-lg border border-gray-200 bg-white p-5 shadow-sm" aria-labelledby="mcp-policy-title">
    <h2 id="mcp-policy-title" className="text-xl font-bold text-[var(--brand-900)]">MCP Execution Policy</h2>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
      Platform-controlled limits for the standalone MCP service. Policies are stored per Commerce environment in the existing Platform Billing Policy. These settings do not change CommerceAgent LIVE budgets.
    </p>
    {error || !editable ? <p role="alert" className="my-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      {error || "The Platform Billing Policy row is missing. Apply the database policy migration before editing MCP settings."}
    </p> : null}
    <div className="mt-4 flex flex-wrap gap-4 rounded-md bg-gray-50 p-3 text-sm">
      <span>Platform policy version: <strong>{version ?? "Unavailable"}</strong></span>
      <span>JSON schema version: <strong>{document?.schemaVersion ?? "Unavailable"}</strong></span>
    </div>
    <div className="mt-4">
      <label htmlFor="mcp-environment" className="mb-1 block text-sm font-semibold text-gray-800">Commerce environment</label>
      <select id="mcp-environment" value={environment} disabled={pending}
        onChange={(event) => chooseEnvironment(event.target.value as McpEnvironment)}
        className="w-full max-w-sm rounded-md border border-gray-300 bg-white p-2 text-sm">
        {MCP_ENVIRONMENTS.map((env) => <option key={env} value={env}>{env}</option>)}
      </select>
      <p className="mt-1 text-sm" role="status">{configured ? "Configured — changing these values updates this environment only." : "Not configured — saving will provision this environment."}</p>
    </div>
    <form className="mt-5 space-y-4" onSubmit={submit}>
      <fieldset disabled={pending || !editable} className="space-y-4 disabled:opacity-65">
        <input type="hidden" name="environment" value={environment}/>
        <input type="hidden" name="expectedVersion" value={version ?? ""}/>
        <McpExecutionPolicyFields values={values} onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))} disabled={pending || !editable}/>
        <label className="block text-sm font-medium text-gray-800">Audit reason
          <textarea name="reason" required rows={2} maxLength={1000} value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm" />
          <span className="mt-1 block text-xs font-normal text-gray-500">Explain why these limits are being changed or removed (maximum 1,000 characters).</span>
        </label>
      </fieldset>
      {result ? <div role={result.ok ? "status" : "alert"}
        className={`rounded-md border p-3 text-sm ${result.ok ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-red-300 bg-red-50 text-red-900"}`}>
        {result.ok ? "MCP policy saved and audited." : result.message}
        {!result.ok && result.conflict ? <button type="button" onClick={() => router.refresh()} className="ml-2 underline">Reload policy</button> : null}
      </div> : null}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending || !editable} name="operation" value="save"
          className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving…" : "Save environment policy"}</button>
        <button type="submit" disabled={pending || !editable || !configured} formNoValidate name="operation" value="clear"
          className="rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">Clear environment policy</button>
      </div>
    </form>
  </section>;
}
