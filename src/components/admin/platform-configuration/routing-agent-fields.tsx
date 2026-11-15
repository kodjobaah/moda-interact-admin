import type { RoutingAgentPolicy } from "@/lib/admin/platform-configuration/routing-agent-contract";

export type RoutingDraft = Record<string, string>;
export const ROUTING_NUMERIC_FIELDS = [
  ["confidenceThreshold", "Minimum selection confidence (%)", 0, 100],
  ["budget.deadlineMs", "Total decision deadline (ms)", 1],
  ["budget.outputTokens", "Output token budget", 1],
  ["budget.toolCalls", "Tool call budget", 0],
  ["retry.maxAttempts", "Maximum attempts", 1],
  ["retry.backoffMs", "Retry delay (ms)", 0],
  ["input.maxHistoryMessages", "Maximum history messages", 0],
  ["input.maxInputCharacters", "Maximum input characters", 1],
  ["input.maxCandidates", "Maximum basket candidates", 1],
  ["decisionTTLms", "Decision lifetime (ms)", 1],
  ["retentionMs", "Unresolved request retention (ms)", 1],
] as const;

export function routingDraft(value: Record<string, unknown> | null): RoutingDraft {
  const read = (path: string) => path.split(".").reduce<unknown>((current, key) => current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined, value);
  const names = ["enabled", "modelBinding.kind", "modelBinding.modelCatalogueEntryId", "promptRevisionId", ...ROUTING_NUMERIC_FIELDS.map(([name]) => name)];
  return Object.fromEntries(names.map((name) => [name, read(name) === undefined ? "" : String(read(name))]));
}

/** Empty controls stay empty; they are not converted into zero/default settings. */
export function routingDraftPayload(draft: RoutingDraft): unknown {
  const numeric = (key: string) => draft[key]?.trim() ? Number(draft[key]) : undefined;
  return {
    schemaVersion: 1, enabled: draft.enabled === "true" ? true : draft.enabled === "false" ? false : undefined,
    modelBinding: draft["modelBinding.kind"] === "FIXED_CATALOGUE"
      ? { kind: "FIXED_CATALOGUE", modelCatalogueEntryId: draft["modelBinding.modelCatalogueEntryId"] }
      : { kind: draft["modelBinding.kind"] },
    promptRevisionId: draft.promptRevisionId, wrapperAudience: "ROUTER",
    confidenceThreshold: numeric("confidenceThreshold"),
    budget: { deadlineMs: numeric("budget.deadlineMs"), outputTokens: numeric("budget.outputTokens"), toolCalls: numeric("budget.toolCalls") },
    retry: { maxAttempts: numeric("retry.maxAttempts"), backoffMs: numeric("retry.backoffMs") },
    input: { maxHistoryMessages: numeric("input.maxHistoryMessages"), maxInputCharacters: numeric("input.maxInputCharacters"), maxCandidates: numeric("input.maxCandidates") },
    decisionTTLms: numeric("decisionTTLms"), retentionMs: numeric("retentionMs"),
  };
}

export function RoutingAgentFields({ draft, onChange, errors }: {
  draft: RoutingDraft; onChange: (key: string, value: string) => void; errors?: Record<string, string>;
}) {
  const error = (name: string) => errors?.[name] ? <p role="alert" id={`routing-error-${name}`} className="text-sm text-red-800">{errors[name]}</p> : null;
  const input = (name: string, label: string) => <label className="block space-y-1 text-sm" key={name}>
    <span className="font-semibold">{label}</span>
    <input name={name} value={draft[name] ?? ""} onChange={(event) => onChange(name, event.target.value)} required maxLength={191}
      aria-invalid={Boolean(errors?.[name])} aria-describedby={errors?.[name] ? `routing-error-${name}` : undefined} className="w-full rounded border border-gray-300 p-2" />{error(name)}
  </label>;
  return <div className="space-y-5">
    <label className="block text-sm font-semibold">Semantic selection
      <select name="enabled" value={draft.enabled ?? ""} onChange={(event) => onChange("enabled", event.target.value)} required className="mt-1 block w-full rounded border p-2">
        <option value="">Choose a state</option><option value="false">Disabled — clarify instead</option><option value="true">Enabled</option>
      </select>{error("enabled")}
    </label>
    <label className="block text-sm font-semibold">Model selection
      <select name="modelBinding.kind" value={draft["modelBinding.kind"] ?? ""} onChange={(event) => onChange("modelBinding.kind", event.target.value)} required className="mt-1 block w-full rounded border p-2">
        <option value="">Choose a model binding</option><option value="FIXED_CATALOGUE">Fixed platform catalogue model</option><option value="VERIFIED_SHOP_INHERIT">Inherit only after shop ownership is verified</option>
      </select>{error("modelBinding.kind")}
    </label>
    {draft["modelBinding.kind"] === "FIXED_CATALOGUE" && input("modelBinding.modelCatalogueEntryId", "Platform model catalogue entry ID")}
    <p className="text-sm text-gray-600">Provider, model parameters and reasoning settings come from the <a className="underline" href="/commerce-models/catalogue">model catalogue</a>. No credentials are entered here. Inherited selection has no unknown-shop fallback.</p>
    {input("promptRevisionId", "Published platform routing prompt revision ID")}
    <p className="text-sm text-gray-600">Use a separate published routing prompt. The normal commerce agent’s active prompt is never changed by this editor.</p>
    <dl className="text-sm"><dt className="font-semibold">Clarification template audience</dt><dd>ROUTER — the independently published neutral template</dd></dl>
    <div className="grid gap-4 sm:grid-cols-2">{ROUTING_NUMERIC_FIELDS.map(([name, label, minimum, ...rest]) => <label key={name} className="block space-y-1 text-sm">
      <span className="font-semibold">{label}</span><input name={name} type="number" step={1} min={minimum} max={rest[0] ?? 2_147_483_647} required value={draft[name] ?? ""}
        onChange={(event) => onChange(name, event.target.value)} aria-invalid={Boolean(errors?.[name])} aria-describedby={errors?.[name] ? `routing-error-${name}` : undefined}
        className="w-full rounded border border-gray-300 p-2" />{error(name)}
    </label>)}</div>
  </div>;
}

export function RoutingPolicyPreview({ policy }: { policy: RoutingAgentPolicy }) {
  return <aside aria-label="Routing policy preview" className="rounded border bg-gray-50 p-3 text-sm">
    <h3 className="font-semibold">Saved-policy preview</h3>
    <p>{policy.enabled ? "Semantic selection enabled" : "Semantic selection disabled; use neutral clarification"}. Confidence: {policy.confidenceThreshold}%. Model binding: {policy.modelBinding.kind}.</p>
    <p>{policy.budget.outputTokens} output tokens within {policy.budget.deadlineMs} ms; {policy.retry.maxAttempts} attempts. At most {policy.input.maxCandidates} complete basket candidates; overflow clarifies without truncating.</p>
    <p>Decision lifetime: {policy.decisionTTLms} ms. Retention: {policy.retentionMs} ms. Preview does not invoke a model or send messages.</p>
  </aside>;
}
