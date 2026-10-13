"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { saveLivePlanBudgetAction, type SaveLivePlanBudgetResult } from "@/app/actions/commerce-model-plan-policy";
import { BudgetPolicyFields } from "./budget-policy-fields";
import type { LivePlanPolicyView, LivePlanPolicyHistoryEntry } from "@/lib/admin/commerce-model-plan-policy";
import type { CommerceBudgetKey } from "@/lib/admin/commerce-model-policy-fields";

function description(budget: LivePlanPolicyHistoryEntry["previousBudget"]) {
  const pairs = Object.entries(budget).map(([key, value]) => `${key}: ${value}`);
  return pairs.length ? pairs.join(" · ") : "Inherit all";
}

export function LivePlanPolicyControls({ policy, history, page, hasMore, canEdit, historyBaseHref }: {
  policy: LivePlanPolicyView;
  history: LivePlanPolicyHistoryEntry[];
  page: number;
  hasMore: boolean;
  canEdit: boolean;
  historyBaseHref: string;
}) {
  const router = useRouter();
  const historyHref = (nextPage: number) => `${historyBaseHref}${historyBaseHref.includes("?") ? "&" : "?"}commercePlanHistoryPage=${nextPage + 1}`;
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SaveLivePlanBudgetResult | null>(null);
  const [overrides, setOverrides] = useState<Record<CommerceBudgetKey, boolean>>({
    deadlineMs: policy.budget.deadlineMs !== undefined,
    outputTokens: policy.budget.outputTokens !== undefined,
  });
  const [values, setValues] = useState<Record<CommerceBudgetKey, string>>({
    deadlineMs: String(policy.budget.deadlineMs ?? policy.effective.deadlineMs),
    outputTokens: String(policy.budget.outputTokens ?? policy.effective.outputTokens),
  });
  const [reason, setReason] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !canEdit) return;
    submitting.current = true;
    setPending(true);
    setResult(null);
    try {
      const response = await saveLivePlanBudgetAction(new FormData(event.currentTarget));
      setResult(response);
      if (response.ok) {
        setReason("");
        router.refresh();
      }
    } catch {
      setResult({ ok: false, message: "Could not save Price Plan policy. Reload before retrying." });
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  const inherited = {
    deadlineMs: { value: policy.platformBudget.deadlineMs, source: "LIVE Platform" },
    outputTokens: { value: policy.platformBudget.outputTokens, source: "LIVE Platform" },
  };
  const errorFields = result && !result.ok ? result.fieldErrors : undefined;
  return (
    <section className="mb-6 min-w-0 rounded-lg border border-gray-200 bg-white p-4" aria-label="Price Plan CommerceAgent Policy">
      <h2 className="text-lg font-semibold text-[var(--brand-900)]">CommerceAgent Policy</h2>
      <p className="mt-1 text-sm text-gray-600">Administrator-managed LIVE budget overrides for this Price Plan. Unchecked fields inherit the Platform policy. This editor is separate from plan publishing and translations.</p>
      <div className="mt-3 flex flex-wrap gap-4 rounded-md bg-gray-50 p-3 text-xs text-gray-700">
        <span>Environment: <strong>{policy.environment}</strong></span>
        <span>Scope: <strong>LIVE · PRICE_PLAN</strong></span>
        <span>Policy version: <strong>{policy.editVersion || "No override"}</strong></span>
      </div>
      <dl className="my-4 grid gap-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-gray-600">Effective conversation deadline</dt><dd className="font-semibold">{policy.effective.deadlineMs.toLocaleString()} ms · {policy.sources.deadlineMs}</dd></div>
        <div><dt className="text-xs text-gray-600">Effective model output tokens</dt><dd className="font-semibold">{policy.effective.outputTokens.toLocaleString()} · {policy.sources.outputTokens}</dd></div>
      </dl>
      <form onSubmit={save} className="space-y-4">
        <fieldset disabled={pending || !canEdit} className="space-y-4 disabled:opacity-70">
          <input type="hidden" name="planId" value={policy.planId}/>
          <input type="hidden" name="expectedEditVersion" value={policy.editVersion}/>
          <BudgetPolicyFields
            values={values} onChange={(key, value) => setValues((old) => ({ ...old, [key]: value }))}
            optional overrides={overrides}
            onOverrideChange={(key, checked) => setOverrides((old) => ({ ...old, [key]: checked }))}
            inherited={inherited} fieldErrors={errorFields} disabled={pending || !canEdit}
          />
          {/* Unchecked inputs are omitted from JSON; never copy Platform values to overrides. */}
          {Object.entries(overrides).map(([key, on]) => on ? <input key={key} type="hidden" name={`override_${key}`} value="on"/> : null)}
          <p className="text-xs text-gray-600">The current LIVE Background turn envelope supports deadlines up to 90,000 ms.</p>
          <div>
            <label htmlFor="commerce-plan-policy-reason" className="block text-sm font-semibold">Audit reason</label>
            <textarea id="commerce-plan-policy-reason" name="reason" rows={2} maxLength={1000} required value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded border border-gray-300 p-2 text-sm" placeholder="Explain why this Price Plan budget is changing"/>
            {errorFields?.reason ? <p role="alert" className="text-sm text-red-700">{errorFields.reason}</p> : null}
          </div>
        </fieldset>
        {result ? <p role={result.ok ? "status" : "alert"} className={`rounded p-3 text-sm ${result.ok ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}>
          {result.ok ? "LIVE Price Plan policy saved and audited." : result.message}
          {!result.ok && result.conflict ? <button type="button" onClick={() => router.refresh()} className="ml-2 underline">Reload current policy</button> : null}
        </p> : null}
        <button type="submit" disabled={pending || !canEdit} className="rounded bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving policy…" : "Save CommerceAgent policy"}</button>
        {!canEdit ? <p className="text-xs text-gray-600">Only SUPER_ADMIN may change LIVE execution budgets.</p> : null}
      </form>
      <div className="mt-6 border-t pt-4">
        <h3 className="font-semibold">Policy History</h3>
        <p className="text-xs text-gray-600">Audit events for this Price Plan and environment, including cleared overrides.</p>
        {history.length ? <div className="mt-3 space-y-3">{history.map((event) => <article key={event.id} className="rounded border p-3 text-xs">
          <p><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time> · {event.actor}</p>
          <p className="mt-1 font-semibold">{event.reason}</p>
          <p>Before: {description(event.previousBudget)} (v{event.previousEditVersion})</p>
          <p>After: {description(event.nextBudget)} (v{event.nextEditVersion})</p>
        </article>)}</div> : <p className="mt-2 text-sm text-gray-600">No policy changes recorded.</p>}
        <nav aria-label="Price Plan policy history pages" className="mt-3 flex gap-4 text-sm">
          {page > 0 ? <a href={historyHref(page - 1)} className="underline">Previous</a> : null}
          <span>Page {page + 1}</span>
          {hasMore ? <a href={historyHref(page + 1)} className="underline">Next</a> : null}
        </nav>
      </div>
    </section>
  );
}
