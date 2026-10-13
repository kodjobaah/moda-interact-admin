"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { saveLivePlatformBudgetAction, type SaveLivePlatformBudgetResult } from "@/app/actions/commerce-model-platform-policy";
import { BudgetPolicyFields } from "./budget-policy-fields";
import type { LivePlatformPolicyView, LivePlatformPolicyHistoryEntry } from "@/lib/admin/commerce-model-platform-policy";
import type { CommerceBudgetKey } from "@/lib/admin/commerce-model-policy-fields";

function budgetDescription(budget: LivePlatformPolicyHistoryEntry["previousBudget"]) {
  if (!budget) return "Unavailable";
  return `${budget.deadlineMs.toLocaleString()} ms · ${budget.outputTokens.toLocaleString()} tokens`;
}

export function LivePlatformPolicyControls({ policy, history, page, hasMore, canEdit }: {
  policy: LivePlatformPolicyView | null;
  history: LivePlatformPolicyHistoryEntry[];
  page: number;
  hasMore: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SaveLivePlatformBudgetResult | null>(null);
  const [values, setValues] = useState(() => ({
    deadlineMs: policy ? String(policy.budget.deadlineMs) : "",
    outputTokens: policy ? String(policy.budget.outputTokens) : "",
  }));
  const [reason, setReason] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !policy || !canEdit) return;
    submitting.current = true;
    setPending(true);
    setResult(null);
    try {
      const form = new FormData(event.currentTarget);
      const response = await saveLivePlatformBudgetAction(form);
      setResult(response);
      if (response.ok) {
        setReason("");
        router.refresh();
      }
    } catch {
      setResult({ ok: false, message: "Could not save CommerceAgent policy. Reload and retry." });
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  const errorFields = result && !result.ok ? result.fieldErrors : undefined;
  return (
    <section className="mt-8 min-w-0 rounded-lg border border-gray-200 bg-white p-5 shadow-sm" aria-labelledby="commerce-live-policy-title">
      <div className="mb-5">
        <h2 id="commerce-live-policy-title" className="text-xl font-bold text-[var(--brand-900)]">CommerceAgent Execution Policy</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
          Administrator-managed LIVE defaults for customer conversation turns. Price Plan and Merchant overrides are managed separately; these settings do not change Studio Preview policies or billing limits.
        </p>
      </div>
      {!policy ? (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Required LIVE Platform policy is unavailable. Verify the ARCH-038 database migration. Saving is disabled until the policy is restored.
        </p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-4 rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
            <span>Environment: <strong>{policy.environment}</strong></span>
            <span>Source: <strong>LIVE · PLATFORM</strong></span>
            <span>Budget schema: <strong>v{policy.budgetSchemaVersion}</strong></span>
            <span>Policy edit version: <strong>{policy.editVersion}</strong></span>
          </div>
          <form onSubmit={save} className="space-y-4">
            <fieldset disabled={pending || !canEdit} className="min-w-0 space-y-4 disabled:opacity-70">
              <input type="hidden" name="expectedEditVersion" value={policy.editVersion}/>
              <BudgetPolicyFields values={values} onChange={(key: CommerceBudgetKey, value) => setValues((current) => ({ ...current, [key]: value }))} fieldErrors={errorFields} disabled={pending || !canEdit}/>
              <p className="text-xs text-gray-600">The current LIVE Background turn envelope is 90,000 ms. Larger deadlines require coordinated Background support; values are never silently clamped.</p>
              <div>
                <label htmlFor="commerce-platform-reason" className="mb-1 block text-sm font-semibold text-gray-800">Audit reason</label>
                <textarea id="commerce-platform-reason" name="reason" rows={2} maxLength={1000} required value={reason} onChange={(event) => setReason(event.target.value)} className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm" placeholder="Why are these execution budgets changing?"/>
                {errorFields?.reason ? <p role="alert" className="text-xs text-red-700">{errorFields.reason}</p> : null}
              </div>
            </fieldset>
            {result ? (
              <div role={result.ok ? "status" : "alert"} className={`rounded-md border p-3 text-sm ${result.ok ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-red-300 bg-red-50 text-red-900"}`}>
                {result.ok ? "LIVE CommerceAgent policy saved and audited." : result.message}
                {!result.ok && result.conflict ? (
                  <button type="button" onClick={() => router.refresh()} className="ml-2 font-semibold underline">Reload current policy</button>
                ) : null}
              </div>
            ) : null}
            <button type="submit" disabled={pending || !canEdit} className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)] disabled:cursor-not-allowed disabled:opacity-50">
              {pending ? "Saving policy…" : "Save CommerceAgent policy"}
            </button>
            {!canEdit ? <p className="text-xs text-gray-600">Only SUPER_ADMIN may edit LIVE execution budgets.</p> : null}
          </form>
        </>
      )}
      <div className="mt-8 border-t border-gray-200 pt-5">
        <h3 className="font-semibold text-gray-900">Policy History</h3>
        <p className="mt-1 text-xs text-gray-600">Audit events are scoped to this LIVE Platform policy and environment.</p>
        {history.length === 0 ? (
          <p className="mt-4 text-sm text-gray-600">No policy changes have been recorded.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {history.map((event) => (
              <article key={event.id} className="min-w-0 rounded-md border border-gray-200 p-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2 text-xs text-gray-600">
                  <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time>
                  <span>{event.actor}</span>
                </div>
                <p className="mt-2 break-words font-medium text-gray-900">{event.reason}</p>
                <p className="mt-1 text-xs text-gray-700">Before: {budgetDescription(event.previousBudget)} (v{event.previousEditVersion ?? "?"})</p>
                <p className="mt-1 text-xs text-gray-700">After: {budgetDescription(event.nextBudget)} (v{event.nextEditVersion ?? "?"})</p>
              </article>
            ))}
          </div>
        )}
        <nav aria-label="CommerceAgent policy history pages" className="mt-4 flex items-center gap-4 text-sm">
          {page > 0 ? <a className="text-[var(--brand-700)] underline" href={`/system-controls/platform-policy?commerceHistoryPage=${page - 1}`}>Previous page</a> : null}
          <span>Page {page + 1}</span>
          {hasMore ? <a className="text-[var(--brand-700)] underline" href={`/system-controls/platform-policy?commerceHistoryPage=${page + 1}`}>Next page</a> : null}
        </nav>
      </div>
    </section>
  );
}
