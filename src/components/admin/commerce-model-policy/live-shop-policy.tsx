"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { saveLiveShopBudgetAction, type SaveLiveShopBudgetResult } from "@/app/actions/commerce-model-shop-policy";
import type { LiveShopPolicyHistoryEntry, LiveShopPolicyView } from "@/lib/admin/commerce-model-shop-policy";
import type { CommerceBudgetKey } from "@/lib/admin/commerce-model-policy-fields";
import { BudgetPolicyFields } from "./budget-policy-fields";

function budgetDescription(budget: LiveShopPolicyHistoryEntry["previousBudget"]) {
  const fields = Object.entries(budget).map(([key, value]) => `${key}: ${value}`);
  return fields.length ? fields.join(" · ") : "Inherit all";
}

export function LiveShopPolicyControls({ policy, history, page, hasMore, historyBaseHref, shopPolicyScope }: {
  policy: LiveShopPolicyView;
  history: LiveShopPolicyHistoryEntry[];
  page: number;
  hasMore: boolean;
  historyBaseHref: string;
  shopPolicyScope: string;
}) {
  const router = useRouter();
  const saving = useRef(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SaveLiveShopBudgetResult | null>(null);
  const [overrides, setOverrides] = useState<Record<CommerceBudgetKey, boolean>>({
    deadlineMs: policy.budget.deadlineMs !== undefined,
    outputTokens: policy.budget.outputTokens !== undefined,
  });
  const [values, setValues] = useState<Record<CommerceBudgetKey, string>>({
    deadlineMs: String(policy.budget.deadlineMs ?? policy.effective.deadlineMs),
    outputTokens: String(policy.budget.outputTokens ?? policy.effective.outputTokens),
  });
  const [reason, setReason] = useState("");
  const historyHref = (nextPage: number) => `${historyBaseHref}${historyBaseHref.includes("?") ? "&" : "?"}commerceShopHistoryPage=${nextPage + 1}`;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setPending(true);
    setResult(null);
    try {
      const response = await saveLiveShopBudgetAction(new FormData(event.currentTarget));
      setResult(response);
      if (response.ok) { setReason(""); router.refresh(); }
    } catch {
      setResult({ ok: false, message: "Could not save the Merchant policy. Reload before retrying." });
    } finally { saving.current = false; setPending(false); }
  }

  const inherited = {
    deadlineMs: { value: policy.planBudget.deadlineMs ?? policy.platformBudget.deadlineMs,
      source: policy.planBudget.deadlineMs === undefined ? "LIVE Platform" : "current Price Plan" },
    outputTokens: { value: policy.planBudget.outputTokens ?? policy.platformBudget.outputTokens,
      source: policy.planBudget.outputTokens === undefined ? "LIVE Platform" : "current Price Plan" },
  };
  const fieldErrors = result && !result.ok ? result.fieldErrors : undefined;
  const plan = policy.currentPlan.plan;
  return (
    <section aria-label="Merchant CommerceAgent Policy" className="space-y-5 rounded-lg border border-gray-200 bg-white p-5">
      <div>
        <h2 className="text-lg font-semibold text-[var(--brand-900)]">CommerceAgent Execution Policy</h2>
        <p className="mt-1 text-sm text-gray-600">Administrator-managed LIVE overrides for this merchant. Unchecked fields inherit from the verified current Price Plan or Platform; merchants cannot edit these settings.</p>
      </div>
      <div className="flex flex-wrap gap-4 rounded-md bg-gray-50 p-3 text-xs text-gray-700">
        <span>Environment: <strong>{policy.environment}</strong></span>
        <span>Scope: <strong>LIVE · SHOP</strong></span>
        <span>Policy version: <strong>{policy.editVersion || "No override"}</strong></span>
      </div>
      <div className="rounded-md border border-gray-200 p-3 text-sm">
        <h3 className="font-semibold">Current Price Plan</h3>
        {plan ? <p className="mt-1"><Link className="font-medium text-[var(--brand-700)] underline" href={`/billing?view=plans&planId=${encodeURIComponent(plan.id)}`}>{plan.name} ({plan.handle})</Link></p>
          : <p className="mt-1 font-medium text-amber-800">{policy.currentPlan.state === "UNMATCHED_PLAN" ? "Unmatched current plan" : "No eligible current plan"}</p>}
        <p className="mt-1 text-xs text-gray-600">{policy.currentPlan.message}</p>
      </div>
      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="min-w-full text-left text-xs sm:text-sm">
          <caption className="px-3 py-2 text-left font-semibold">LIVE per-field inheritance and effective values</caption>
          <thead className="bg-gray-50 text-gray-700"><tr>{["Field", "Platform", "Current Price Plan", "Merchant override", "Effective source/value"].map((label) => <th className="px-3 py-2" key={label}>{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-200">
            {(["deadlineMs", "outputTokens"] as const).map((key) => (
              <tr key={key}>
                <th className="px-3 py-2">{key === "deadlineMs" ? "Conversation deadline (ms)" : "Model output tokens"}</th>
                <td className="px-3 py-2">{policy.platformBudget[key].toLocaleString()}</td>
                <td className="px-3 py-2">{policy.planBudget[key]?.toLocaleString() ?? (plan ? "Inherit Platform" : "Not resolved")}</td>
                <td className="px-3 py-2">{policy.budget[key]?.toLocaleString() ?? "Inherit"}</td>
                <td className="px-3 py-2 font-semibold">{policy.effective[key].toLocaleString()} · {policy.sources[key]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={save} className="space-y-4">
        <fieldset disabled={pending} className="space-y-4 disabled:opacity-70">
          <input type="hidden" name="shopId" value={policy.shopId} />
          <input type="hidden" name="shopPolicyScope" value={shopPolicyScope} />
          <input type="hidden" name="expectedEditVersion" value={policy.editVersion} />
          <BudgetPolicyFields values={values} onChange={(key, value) => setValues((old) => ({ ...old, [key]: value }))}
            optional overrides={overrides} onOverrideChange={(key, checked) => setOverrides((old) => ({ ...old, [key]: checked }))}
            inherited={inherited} fieldErrors={fieldErrors} disabled={pending} />
          {Object.entries(overrides).map(([key, on]) => on ? <input key={key} type="hidden" name={`override_${key}`} value="on" /> : null)}
          <p className="text-xs text-gray-600">The current LIVE Background turn envelope supports deadlines up to 90,000 ms.</p>
          <label className="block text-sm font-semibold" htmlFor={`shop-policy-reason-${policy.shopId}`}>Audit reason</label>
          <textarea id={`shop-policy-reason-${policy.shopId}`} name="reason" rows={2} maxLength={1000} required
            value={reason} onChange={(event) => setReason(event.target.value)}
            className="w-full rounded border border-gray-300 p-2 text-sm" placeholder="Explain why this Merchant policy is changing" />
          {fieldErrors?.reason ? <p role="alert" className="text-sm text-red-700">{fieldErrors.reason}</p> : null}
        </fieldset>
        {result ? <p role={result.ok ? "status" : "alert"} className={`rounded p-3 text-sm ${result.ok ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}>
          {result.ok ? "Merchant execution policy saved and audited." : result.message}
          {!result.ok && result.conflict ? <button type="button" onClick={() => router.refresh()} className="ml-2 underline">Reload current policy</button> : null}
        </p> : null}
        <button disabled={pending} type="submit" className="rounded bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving policy…" : "Save CommerceAgent policy"}</button>
      </form>
      <div className="border-t border-gray-200 pt-4">
        <h3 className="font-semibold">Policy History</h3>
        <p className="text-xs text-gray-600">History is limited to this merchant, LIVE context and environment, including cleared overrides.</p>
        {history.length ? <div className="mt-3 space-y-3">{history.map((event) => <article key={event.id} className="rounded border p-3 text-xs">
          <p><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time> · {event.actor}</p>
          <p className="mt-1 font-semibold">{event.reason}</p>
          <p>Before: {budgetDescription(event.previousBudget)} (v{event.previousEditVersion})</p>
          <p>After: {budgetDescription(event.nextBudget)} (v{event.nextEditVersion})</p>
        </article>)}</div> : <p className="mt-2 text-sm text-gray-600">No policy changes recorded.</p>}
        <nav aria-label="Merchant policy history pages" className="mt-3 flex gap-4 text-sm">
          {page > 0 ? <a className="underline" href={historyHref(page - 1)}>Previous</a> : null}
          <span>Page {page + 1}</span>
          {hasMore ? <a className="underline" href={historyHref(page + 1)}>Next</a> : null}
        </nav>
      </div>
    </section>
  );
}
