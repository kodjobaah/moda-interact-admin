import Link from "next/link";
import { requestBillingSyncReconciliationAction } from "@/app/actions/billing-sync-errors";
import type { BillingSyncErrorItem } from "@/lib/admin/billing-sync-errors";
import type { PageResult } from "@/lib/admin/types";
import { buildUrl } from "@/lib/admin/query";
import { Pagination } from "./pagination";

function guidance(errorCode: string | null): string {
  switch (errorCode) {
    case "MISSING_USAGE_METER":
      return "Review the mapped billing plan and Shopify usage meter configuration, then request reconciliation.";
    case "INVALID_INCLUDED_ALLOWANCE":
      return "Review the operational billing plan allowance, then request reconciliation.";
    case "MISSING_BILLING_CYCLE":
      return "Shopify has not supplied a usable billing cycle. Retry after provider state is available.";
    case "BILLING_PERIOD_PLAN_CONFLICT":
      return "The current billing-period projection conflicts with provider/plan state. Review the tenant billing state before retrying.";
    case "LIFETIME_FREE_COUNTER_HISTORY_CONFLICT":
      return "Automatic counter recreation is unsafe because historical recovery usage exists. Correct the billing state manually before retrying.";
    case "UNEXPECTED_IMMEDIATE_PLAN_CHANGE":
      return "Shopify reported a plan transition outside the expected lifecycle. Review the current plan state and retry reconciliation.";
    default:
      return "Review the tenant/provider state, correct the underlying cause if necessary, then request reconciliation.";
  }
}

function date(value: Date | null): string {
  return value
    ? value.toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      })
    : "Not recorded";
}

export function BillingSyncErrors({
  subscriptions,
  params,
}: {
  subscriptions: PageResult<BillingSyncErrorItem>;
  params: Record<string, string>;
}) {
  const returnTo = buildUrl("/billing", {
    ...params,
    view: "sync-errors",
    syncReconcileRequested: null,
  });

  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-5 py-4">
        <h2 className="text-lg font-semibold text-gray-950">
          Subscription sync errors
        </h2>
        <p className="mt-1 max-w-4xl text-sm text-gray-500">
          A sync error is not cleared manually. Correct the underlying billing or
          Shopify state when required, then request reconciliation. The billing
          worker will reconstruct the scheduled subscription reconciliation on its
          next billing cycle and only clear the error after a successful provider
          projection.
        </p>
      </div>

      {subscriptions.items.length ? (
        <div className="divide-y divide-gray-200">
          {subscriptions.items.map((item) => (
            <article key={item.id} className="p-5">
              <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_1.2fr]">
                <div>
                  <div className="font-semibold text-gray-950">
                    {item.brandName ?? item.shopDomain}
                  </div>
                  <div className="text-xs text-gray-500">{item.shopDomain}</div>
                  <Link
                    className="mt-2 inline-block text-sm font-semibold text-[var(--brand-700)] hover:underline"
                    href={buildUrl("/", {
                      tenant: item.shopId,
                      tab: "billing",
                      billingView: "overview",
                    })}
                  >
                    Review tenant billing
                  </Link>
                </div>

                <dl className="grid gap-3 text-sm">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Current plan
                    </dt>
                    <dd className="mt-1 text-gray-900">
                      {item.plan?.name ?? "Not mapped"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Shopify handle
                    </dt>
                    <dd className="mt-1 break-all text-gray-900">
                      {item.observedShopifyPlanHandle ?? "Not reported"}
                    </dd>
                  </div>
                  {item.pendingPlan ? (
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Pending plan
                      </dt>
                      <dd className="mt-1 text-gray-900">{item.pendingPlan.name}</dd>
                    </div>
                  ) : null}
                </dl>

                <dl className="grid gap-3 text-sm">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Error
                    </dt>
                    <dd className="mt-1 font-mono text-xs text-red-700">
                      {item.lastSyncErrorCode ?? "UNKNOWN"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Last error
                    </dt>
                    <dd className="mt-1 text-gray-900">{date(item.lastSyncErrorAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Next reconciliation
                    </dt>
                    <dd className="mt-1 text-gray-900">{date(item.nextReconcileAt)}</dd>
                  </div>
                </dl>
              </div>

              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {guidance(item.lastSyncErrorCode)}
              </div>

              {item.canRequestReconciliation ? (
                <form
                  action={requestBillingSyncReconciliationAction}
                  className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]"
                >
                  <input type="hidden" name="subscriptionId" value={item.id} />
                  <input
                    type="hidden"
                    name="expectedErrorCode"
                    value={item.lastSyncErrorCode ?? "UNKNOWN"}
                  />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <label className="text-sm font-medium text-gray-700">
                    Reconciliation reason
                    <input
                      name="reason"
                      required
                      maxLength={1000}
                      placeholder="What was checked or corrected before retrying?"
                      className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm font-normal"
                    />
                  </label>
                  <button
                    type="submit"
                    className="self-end rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]"
                  >
                    Request reconciliation
                  </button>
                </form>
              ) : (
                <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                  Automatic subscription retry is not safe for this state. Use the tenant billing link above to inspect and correct the underlying billing state; the error remains visible until a successful provider projection clears it.
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="px-5 py-10 text-sm text-gray-500">
          No subscription sync errors require attention.
        </div>
      )}

      <Pagination
        pathname="/billing"
        params={{ ...params, view: "sync-errors" }}
        page={subscriptions.page}
        totalPages={subscriptions.totalPages}
        totalItems={subscriptions.totalItems}
        pageParam="syncErrorPage"
        resetParams={["syncReconcileRequested"]}
      />
    </section>
  );
}
