"use client";

import { useActionState, useState } from "react";
import { mutateBackgroundRuntimeControlsAction } from "@/app/actions/background-runtime-controls";
import {
  fieldsForSection,
  runtimeFieldDisplayDefault,
  runtimeFieldDisplayRange,
  runtimeFieldDisplayValue,
  runtimeFieldInputStep,
  runtimeControlsSuccessMessage,
  RUNTIME_FIELDS,
  type RuntimeSection,
} from "@/lib/admin/background-runtime-control-validation";
import type { BackgroundRuntimeConfigView } from "@/app/actions/background-runtime-controls";

const tabs: Array<{ value: RuntimeSection; label: string }> = [
  { value: "OPERATIONAL", label: "Operational" },
  { value: "ADVANCED", label: "Advanced" },
  { value: "ABUSE_PROTECTION", label: "Abuse Protection" },
];

const queueConcurrencyFields = [
  "checkoutQueueGlobalConcurrency",
  "orderQueueGlobalConcurrency",
  "pendingRecoveryQueueGlobalConcurrency",
  "recoveryResumeQueueGlobalConcurrency",
  "whatsappQueueGlobalConcurrency",
  "merchantCommunicationsQueueGlobalConcurrency",
  "billingSubscriptionQueueGlobalConcurrency",
];

const inputClass =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)] disabled:bg-gray-100 disabled:text-gray-500";

type ActionState = { ok: boolean; message?: string } | null;

type Draft = Record<string, string>;

function displayDraft(config: BackgroundRuntimeConfigView, section: RuntimeSection): Draft {
  return Object.fromEntries(
    fieldsForSection(section).map((field) => [field.key, runtimeFieldDisplayValue(field, config[field.key] as number)]),
  );
}

function FieldRow({
  field,
  value,
  canMutate,
  onChange,
}: {
  field: ReturnType<typeof fieldsForSection>[number];
  value: string;
  canMutate: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 border-t border-gray-100 py-4 md:grid-cols-[minmax(13rem,1fr)_minmax(10rem,14rem)_minmax(15rem,1.4fr)] md:items-start">
      <div>
        <label className="text-sm font-semibold text-gray-950" htmlFor={field.key}>
          {field.label}
        </label>
        <details className="mt-1 text-xs text-gray-500">
          <summary className="cursor-pointer select-none">Show technical details</summary>
          <code className="mt-1 block break-all">{field.key}</code>
        </details>
      </div>
      <div>
        <div className="flex items-center gap-2">
          <input
            id={field.key}
            name={field.key}
            className={inputClass}
            type="number"
            min={field.min / (field.displayMultiplier ?? 1)}
            max={field.max / (field.displayMultiplier ?? 1)}
            step={runtimeFieldInputStep(field)}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={!canMutate}
            required
          />
          <span className="shrink-0 text-xs text-gray-500">{field.unit}</span>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Default: {runtimeFieldDisplayDefault(field)}{field.displayDefault ? "" : ` ${field.unit}`}. Allowed: {runtimeFieldDisplayRange(field)}.
        </p>
      </div>
      <p className="text-sm leading-6 text-gray-600">{field.guidance}</p>
    </div>
  );
}

function RuntimeGroup({
  title,
  fields,
  draft,
  canMutate,
  onChange,
  intro,
}: {
  title: string;
  fields: ReturnType<typeof fieldsForSection>[number][];
  draft: Draft;
  canMutate: boolean;
  onChange: (key: string, value: string) => void;
  intro?: string;
}) {
  return (
    <details open className="rounded-lg border border-gray-200 bg-white">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-950">{title}</summary>
      <div className="px-4 pb-2">
        {intro ? <p className="border-l-4 border-sky-400 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-950">{intro}</p> : null}
        <div className="hidden border-t border-gray-100 py-3 text-xs font-semibold uppercase tracking-normal text-gray-500 md:grid md:grid-cols-[minmax(13rem,1fr)_minmax(10rem,14rem)_minmax(15rem,1.4fr)] md:gap-3">
          <span>Setting</span>
          <span>Value</span>
          <span>Purpose / Guidance</span>
        </div>
        {fields.map((field) => (
          <FieldRow
            key={field.key}
            field={field}
            value={draft[field.key] ?? ""}
            canMutate={canMutate}
            onChange={(value) => onChange(field.key, value)}
          />
        ))}
      </div>
    </details>
  );
}

function TabForm({
  config,
  section,
  canMutate,
  onSaved,
}: {
  config: BackgroundRuntimeConfigView;
  section: RuntimeSection;
  canMutate: boolean;
  onSaved: (section: RuntimeSection, draft: Draft) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => displayDraft(config, section));
  const [initialDraft, setInitialDraft] = useState<Draft>(() => displayDraft(config, section));
  const [reason, setReason] = useState("");
  const [result, formAction, pending] = useActionState<ActionState, FormData>(
    async (_previous, formData) => {
      try {
        await mutateBackgroundRuntimeControlsAction(formData);
        onSaved(section, draft);
        setInitialDraft({ ...draft });
        setReason("");
        const changedQueueConcurrency = queueConcurrencyFields.some((key) => draft[key] !== initialDraft[key]);
        return { ok: true, message: runtimeControlsSuccessMessage(changedQueueConcurrency) };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "Runtime controls could not be saved." };
      }
    },
    null,
  );

  const dirty = fieldsForSection(section).some((field) => draft[field.key] !== initialDraft[field.key]);
  const updateDraft = (key: string, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const reset = () => setDraft({ ...initialDraft });
  const restoreDefaults = () => setDraft((current) => ({ ...current, ...Object.fromEntries(fieldsForSection(section).map((field) => [field.key, runtimeFieldDisplayValue(field, field.defaultValue)])) }));
  const field = (key: string) => RUNTIME_FIELDS[section].find((item) => item.key === key)!;

  const groups: Array<[string, string[]]> =
    section === "OPERATIONAL"
      ? [
          ["Billing", ["billingReconciliationIntervalSeconds", "billingReconciliationShopBatchSize", "shopifyUsagePublishBatchSize"]],
          ["Recovery", ["recoveryRepairIntervalSeconds", "recoveryRepairShopBatchSize", "recoveryResumeBatchSize"]],
          ["Merchant communications", ["translationReconciliationIntervalSeconds", "translationBatchMaxRequests"]],
          ["Messaging", ["conversationQuietWindowMs", "conversationMaxSettleWindowMs"]],
        ]
      : section === "ADVANCED"
        ? [
            ["Billing retries", ["billingFrozenRecheckSeconds", "billingProviderRetrySeconds", "shopifyUsageRetryBaseSeconds", "shopifyUsageRetryMaxSeconds"]],
            ["Translation recovery and retries", ["translationReconciliationPageSize", "translationClaimTimeoutSeconds", "translationSubmitRetrySeconds", "translationInitialPollSeconds", "translationPollIntervalSeconds", "translationResultRetrySeconds", "translationSubmitMaxAttempts", "translationMaxAutoRetries"]],
            ["Worker throughput", ["checkoutQueueGlobalConcurrency", "orderQueueGlobalConcurrency", "pendingRecoveryQueueGlobalConcurrency", "recoveryResumeQueueGlobalConcurrency", "whatsappQueueGlobalConcurrency", "merchantCommunicationsQueueGlobalConcurrency", "billingSubscriptionQueueGlobalConcurrency"]],
          ]
        : [
            ["Incoming WhatsApp messages", ["rawSenderLimitPerMinute", "rawGlobalLimitPerMinute"]],
            ["Conversation turns", ["turnSenderLimitPerMinute", "turnSenderLimitPerTenMinutes", "turnConversationLimitPerMinute", "turnConversationLimitPerTenMinutes", "turnShopLimitPerMinute", "turnGlobalLimitPerMinute"]],
            ["Product discovery", ["discoverySenderLimitPerMinute", "discoverySenderLimitPerTenMinutes", "discoveryConversationLimitPerMinute", "discoveryConversationLimitPerTenMinutes"]],
          ];

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="expectedVersion" value={config.version} />
      {section === "ABUSE_PROTECTION" ? (
        <p className="border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          These controls affect platform protection from excessive WhatsApp traffic. Window lengths are fixed by the application; only the allowed message/turn counts are editable.
        </p>
      ) : null}
      {groups.map(([title, keys]) => (
        <RuntimeGroup
          key={title}
          title={title}
          fields={keys.map(field).filter(Boolean)}
          draft={draft}
          canMutate={canMutate}
          onChange={updateDraft}
          intro={title === "Worker throughput" ? "These values are fleet-wide queue limits across all worker replicas. Adding replicas does not multiply the configured cap." : undefined}
        />
      ))}
      {section === "ADVANCED" ? (
        <details className="rounded-lg border border-gray-200 bg-gray-50">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-950">System-managed settings</summary>
          <p className="px-4 pb-4 text-sm leading-6 text-gray-600">
            These remain application, deployment, or merchant managed and are intentionally not editable here: readiness probe timeout; WhatsApp HTTP timeout; abandoned-checkout lookup safety bounds; database/Redis lock and low-level retry timings; queue telemetry sampling/retention; translation provider output safety bounds; provider credentials, provider identity, and translation model; billing lifecycle retry tier structure; usage-event stale-claim recovery timeout; recovery queue retry/backoff; and merchant recovery delay configured per merchant.
          </p>
        </details>
      ) : null}
      {canMutate ? (
        <label className="block text-sm font-medium text-gray-700">
          Reason
          <textarea className={`${inputClass} mt-1`} name="reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} required disabled={pending} placeholder="Explain why this fleet-wide control is changing." />
        </label>
      ) : null}
      {canMutate ? (
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white/95 py-4 backdrop-blur">
          <span className="text-sm text-gray-600">{dirty ? `${fieldsForSection(section).filter((item) => draft[item.key] !== initialDraft[item.key]).length} unsaved changes` : "No unsaved changes"}</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50" onClick={reset} disabled={!dirty || pending}>Reset unsaved changes</button>
            <button type="button" className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50" onClick={restoreDefaults} disabled={pending}>Restore defaults</button>
            <button type="submit" className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)] disabled:cursor-not-allowed disabled:opacity-50" disabled={!dirty || pending}>{pending ? "Saving..." : "Save changes"}</button>
          </div>
        </div>
      ) : (
        <p className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">You have read-only access to these runtime controls.</p>
      )}
      {result?.message ? <p className={result.ok ? "rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-900" : "rounded-md bg-red-50 px-4 py-3 text-sm text-red-900"}>{result.message}</p> : null}
    </form>
  );
}

export function BackgroundRuntimeControls({ config }: { config: BackgroundRuntimeConfigView }) {
  const [section, setSection] = useState<RuntimeSection>("OPERATIONAL");
  const [currentConfig, setCurrentConfig] = useState(config);
  const saved = (savedSection: RuntimeSection, draft: Draft) => {
    setCurrentConfig((value) => ({
      ...value,
      version: value.version + 1,
      ...Object.fromEntries(
        fieldsForSection(savedSection).map((field) => [
          field.key,
          Number(draft[field.key]) * (field.displayMultiplier ?? 1),
        ]),
      ),
    }));
  };

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-[var(--brand-900)]">Runtime Controls</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">Change how background processing behaves without redeploying workers. Changes are shared across all worker replicas.</p>
      </header>
      <div role="tablist" aria-label="Runtime control classification" className="hidden gap-2 border-b border-gray-200 md:flex">
        {tabs.map((tab) => <button key={tab.value} role="tab" aria-selected={section === tab.value} type="button" className={`border-b-2 px-4 py-3 text-sm font-semibold ${section === tab.value ? "border-[var(--brand-700)] text-[var(--brand-800)]" : "border-transparent text-gray-500 hover:text-gray-800"}`} onClick={() => setSection(tab.value)}>{tab.label}</button>)}
      </div>
      <label className="block md:hidden">
        <span className="sr-only">Runtime control classification</span>
        <select className={inputClass} value={section} onChange={(event) => setSection(event.target.value as RuntimeSection)}>
          {tabs.map((tab) => <option key={tab.value} value={tab.value}>{tab.label}</option>)}
        </select>
      </label>
      <TabForm key={section} config={currentConfig} section={section} canMutate={config.canMutate} onSaved={saved} />
    </section>
  );
}
