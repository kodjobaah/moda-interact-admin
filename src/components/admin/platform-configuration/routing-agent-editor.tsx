"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { mutatePlatformConfigurationAction, publishRoutingPromptAction, type ConfigurationActionResult } from "@/app/actions/platform-configuration";
import { ROUTING_AGENT_KEY, validateRoutingAgentPolicy, type RoutingAgentPolicy } from "@/lib/admin/platform-configuration/routing-agent-contract";
import type { RoutingPromptOptions } from "@/lib/admin/platform-configuration/routing-agent-prompts";
import type { ConfigurationSnapshot } from "@/lib/admin/platform-configuration/repository";
import { RoutingAgentFields, RoutingPolicyPreview, routingDraft, routingDraftPayload } from "./routing-agent-fields";

export function RoutingAgentEditor({ snapshot, routingPrompts }: { snapshot: ConfigurationSnapshot; routingPrompts?: RoutingPromptOptions }) {
  const router = useRouter();
  const processing = useRef(false);
  const [draft, setDraft] = useState(() => routingDraft(snapshot.value));
  const [promptText, setPromptText] = useState("");
  const [promptReason, setPromptReason] = useState("");
  const [promptResult, setPromptResult] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ConfigurationActionResult | null>(null);
  const validation = validateRoutingAgentPolicy(routingDraftPayload(draft));
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (processing.current) return;
    if (!validation.ok) { setResult({ ok: false, code: "INVALID_INPUT", message: validation.message, fieldErrors: validation.fieldErrors }); return; }
    processing.current = true; setPending(true); setResult(null);
    try {
      const response = await mutatePlatformConfigurationAction("save", { key: ROUTING_AGENT_KEY, expectedVersion: snapshot.version, values: validation.values, reason });
      setResult(response);
      if (response.ok) router.refresh();
    } catch { setResult({ ok: false, code: "DB_UNAVAILABLE", message: "Could not save routing settings. Refresh and retry." }); }
    finally { processing.current = false; setPending(false); }
  }
  async function publishPrompt(event: FormEvent) {
    event.preventDefault();
    if (processing.current || !routingPrompts) return;
    processing.current = true; setPending(true); setPromptResult(null);
    try {
      const response = await publishRoutingPromptAction({ promptText, reason: promptReason, expectedLatestRevisionNumber: routingPrompts.latestRevisionNumber });
      if (response.ok) {
        setDraft((previous) => ({ ...previous, promptRevisionId: response.revisionId }));
        setPromptText(""); setPromptReason("");
        setPromptResult("Routing prompt published and selected below. Save routing settings to use it. The normal commerce agent is unchanged.");
        router.refresh();
      } else setPromptResult(response.message);
    } catch { setPromptResult("Could not publish routing instructions. Refresh and retry."); }
    finally { processing.current = false; setPending(false); }
  }
  const refresh = () => {
    if (pending || (JSON.stringify(draft) !== JSON.stringify(routingDraft(snapshot.value)) && !window.confirm("Discard unsaved routing changes and reload?"))) return;
    setDraft(routingDraft(snapshot.value)); setResult(null); router.refresh();
  };
  return <section aria-label="Checkout routing agent editor" className="rounded-xl border bg-white p-5 shadow-sm">
    <h2 className="text-xl font-semibold">Checkout routing agent</h2>
    <p className="my-2 text-sm">Revision {snapshot.version || "not configured"}. All values must be explicitly supplied. There are no hidden model, prompt or budget defaults.</p>
    {(snapshot.invalidStoredValue || !snapshot.version) && <p role="alert" className="my-3 rounded bg-amber-50 p-3 text-sm">Semantic selection is unavailable until a complete valid policy is saved. The router uses neutral clarification instead.</p>}
    {routingPrompts && <details className="my-4 rounded border p-3">
      <summary className="cursor-pointer font-semibold">Publish separate routing instructions</summary>
      <p className="my-2 text-sm">Publishing creates an immutable routing-only revision. It does not activate a normal commerce prompt or automatically save the routing policy.</p>
      <form onSubmit={publishPrompt} className="space-y-3">
        <fieldset disabled={pending} className="space-y-3">
          <label className="block text-sm font-semibold">Routing instructions<textarea name="routingPromptText" value={promptText} onChange={(e) => setPromptText(e.target.value)} maxLength={32000} required rows={8} className="mt-1 block w-full rounded border p-2" /></label>
          <label className="block text-sm font-semibold">Publication reason<input value={promptReason} onChange={(e) => setPromptReason(e.target.value)} maxLength={1000} required className="mt-1 block w-full rounded border p-2" /></label>
          <button type="submit" disabled={pending} className="rounded border px-4 py-2">Publish routing prompt</button>
        </fieldset>
        {promptResult && <p role="status" className="text-sm">{promptResult}</p>}
      </form>
      <label className="mt-3 block text-sm font-semibold">Recent published routing revisions
        <select disabled={pending} value={routingPrompts.revisions.some((revision) => revision.id === draft.promptRevisionId) ? draft.promptRevisionId : ""}
          onChange={(e) => e.target.value && setDraft((previous) => ({ ...previous, promptRevisionId: e.target.value }))} className="mt-1 block w-full rounded border p-2">
          <option value="">Choose a revision, or enter its ID below</option>
          {routingPrompts.revisions.map((revision) => <option key={revision.id} value={revision.id}>Revision {revision.revisionNumber} · {revision.id}</option>)}
        </select>
      </label>
      {routingPrompts.revisions.find((revision) => revision.id === draft.promptRevisionId) && <pre aria-label="Selected routing instructions" className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-3 text-sm">{routingPrompts.revisions.find((revision) => revision.id === draft.promptRevisionId)?.promptText}</pre>}
    </details>}
    <form onSubmit={submit} className="space-y-5">
      <fieldset disabled={pending} className="space-y-5"><RoutingAgentFields draft={draft} errors={result && !result.ok ? result.fieldErrors : undefined}
        onChange={(key, value) => { setDraft((previous) => ({ ...previous, [key]: value })); setResult(null); }} />
        <label className="block text-sm font-semibold">Audit reason (optional)<textarea value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} className="mt-1 block w-full rounded border p-2" rows={2} /></label>
      </fieldset>
      {validation.ok && <RoutingPolicyPreview policy={validation.values as unknown as RoutingAgentPolicy} />}
      {result && <p role={result.ok ? "status" : "alert"} className="rounded border p-3 text-sm">{result.ok ? `Saved revision ${result.version}.` : result.message}</p>}
      <div className="flex gap-3"><button disabled={pending} type="submit" className="rounded bg-[var(--brand-700)] px-4 py-2 font-semibold text-white">{pending ? "Saving…" : "Save routing settings"}</button>
        <button disabled={pending} type="button" onClick={refresh} className="rounded border px-4 py-2">Refresh</button></div>
    </form>
  </section>;
}
