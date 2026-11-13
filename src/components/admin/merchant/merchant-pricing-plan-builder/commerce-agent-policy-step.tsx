"use client";

import { BudgetPolicyFields } from "@/components/admin/commerce-model-policy/budget-policy-fields";
import { type CommerceBudgetKey, LIVE_BACKGROUND_DEADLINE_ENVELOPE_MS } from "@/lib/admin/commerce-model-policy-fields";
import type { CommerceModelBudget } from "@/lib/admin/commerce-model-policy-fields";

type PolicyKey = CommerceBudgetKey;
const POLICY_KEYS: readonly PolicyKey[] = ["deadlineMs", "outputTokens", "initialOutreachToolCalls"];
export type NewPlanBudgetDraft = {
  overrides: Record<PolicyKey, boolean>;
  values: Record<PolicyKey, string>;
  reason: string;
};
export function createEmptyNewPlanBudgetDraft(platform: CommerceModelBudget | null): NewPlanBudgetDraft {
  return {
    overrides: Object.fromEntries(POLICY_KEYS.map((key) => [key, false])) as Record<PolicyKey, boolean>,
    values: Object.fromEntries(POLICY_KEYS.map((key) => [key, String(platform?.[key] ?? "")])) as Record<PolicyKey, string>,
    reason: "",
  };
}
export function serializeNewPlanBudgetDraft(draft: NewPlanBudgetDraft) {
  const budget: Partial<Record<PolicyKey, string>> = {};
  for (const key of POLICY_KEYS) {
    if (draft.overrides[key]) budget[key] = draft.values[key];
  }
  return JSON.stringify({ budget, reason: draft.reason });
}
export function isNewPlanBudgetDraftValid(draft: NewPlanBudgetDraft): boolean {
  const keys = POLICY_KEYS.filter((key) => draft.overrides[key]);
  if (!keys.length) return true;
  if (!draft.reason.trim() || draft.reason.trim().length > 1000) return false;
  return keys.every((key) => {
    const value = draft.values[key].trim();
    const n = Number(value);
    return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(n) &&
      (key !== "deadlineMs" || n <= LIVE_BACKGROUND_DEADLINE_ENVELOPE_MS) &&
      (key !== "initialOutreachToolCalls" || n <= 64);
  });
}

export function CommerceAgentPolicyStep({ platform, draft, onChange }: {
  platform: CommerceModelBudget | null;
  draft: NewPlanBudgetDraft;
  onChange: (value: NewPlanBudgetDraft) => void;
}) {
  if (!platform) return <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm">Required LIVE Platform policy is unavailable. Contact a platform administrator.</p>;
  const anyOverride = Object.values(draft.overrides).some(Boolean);
  return (
    <section className="space-y-4 rounded-lg border border-gray-200 p-4" aria-label="CommerceAgent Policy">
      <h2 className="text-lg font-semibold text-[var(--brand-900)]">CommerceAgent Policy</h2>
      <p className="text-sm text-gray-600">Optional LIVE budget overrides for this new Price Plan. Configure them before saving; unselected fields inherit the current Platform policy. Budget changes will be saved and audited together with plan creation.</p>
      <div className="rounded bg-gray-50 p-3 text-xs text-gray-700">LIVE Platform defaults: {platform.deadlineMs.toLocaleString()} ms · {platform.outputTokens.toLocaleString()} output tokens · {platform.initialOutreachToolCalls.toLocaleString()} initial outreach tool calls</div>
      <BudgetPolicyFields
        values={draft.values} onChange={(key, value) => onChange({ ...draft, values: { ...draft.values, [key]: value } })}
        optional overrides={draft.overrides}
        onOverrideChange={(key, enabled) => onChange({ ...draft, overrides: { ...draft.overrides, [key]: enabled } })}
        inherited={Object.fromEntries(POLICY_KEYS.map((key) => [key, { value: platform[key], source: "LIVE Platform" }])) as Record<PolicyKey, { value: number; source: string }>}
      />
      <p className="text-xs text-gray-600">The current LIVE Background turn envelope supports deadlines up to {LIVE_BACKGROUND_DEADLINE_ENVELOPE_MS.toLocaleString()} ms.</p>
      {anyOverride ? <label className="block text-sm font-semibold">Policy audit reason
        <textarea value={draft.reason} onChange={(event) => onChange({ ...draft, reason: event.target.value })}
          maxLength={1000} required rows={2} className="mt-1 w-full rounded border p-2 font-normal" placeholder="Why are these Price Plan execution budgets changing?"/>
      </label> : <p className="text-sm text-gray-600">Both fields inherit. No CommerceAgent override will be created.</p>}
      {!isNewPlanBudgetDraftValid(draft) ? <p role="alert" className="text-sm text-red-700">Provide positive whole-number override values within the current deadline envelope and an audit reason before continuing.</p> : null}
    </section>
  );
}
