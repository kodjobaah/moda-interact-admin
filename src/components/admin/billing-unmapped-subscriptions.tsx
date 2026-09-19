import Link from "next/link";
import { resolveUnmappedSubscriptionAction } from "@/app/actions/billing-unmapped-subscriptions";
import type {
  UnmappedResolutionState,
  UnmappedSubscriptionDetail,
  UnmappedSubscriptionItem,
} from "@/lib/admin/unmapped-subscriptions";
import type { PageResult } from "@/lib/admin/types";
import { buildUrl, withParamUpdates } from "@/lib/admin/query";
import { AdminDetailDrawer } from "./admin-detail-drawer";
import { Pagination } from "./pagination";

function resolutionLabel(state: UnmappedResolutionState): string {
  switch (state) {
    case "MISSING_OBSERVED_HANDLE":
      return "Provider handle missing";
    case "CATALOGUE_MISSING":
      return "Catalogue plan missing";
    case "CATALOGUE_INACTIVE":
      return "Catalogue plan inactive";
    case "OPERATIONAL_MISSING":
      return "Operational mapping missing";
    case "OPERATIONAL_DRIFT":
      return "Operational mapping drift";
    case "READY_TO_RECONCILE":
      return "Mapping exists — reconcile";
  }
}

function resolutionTone(state: UnmappedResolutionState): string {
  switch (state) {
    case "READY_TO_RECONCILE":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "OPERATIONAL_MISSING":
    case "OPERATIONAL_DRIFT":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "MISSING_OBSERVED_HANDLE":
    case "CATALOGUE_MISSING":
    case "CATALOGUE_INACTIVE":
      return "border-red-200 bg-red-50 text-red-800";
  }
}

function stateAction(
  item: UnmappedSubscriptionItem,
  params: Record<string, string>,
) {
  if (item.resolutionState === "CATALOGUE_MISSING") {
    return (
      <Link
        href={buildUrl("/billing", {
          view: "plans",
          drawer: "register-plan",
        })}
        className="font-semibold text-[var(--brand-700)] hover:underline"
      >
        Register exact plan handle
      </Link>
    );
  }

  if (
    item.resolutionState === "CATALOGUE_INACTIVE" &&
    item.cataloguePlan
  ) {
    return (
      <Link
        href={buildUrl("/billing", {
          view: "plans",
          planId: item.cataloguePlan.id,
        })}
        className="font-semibold text-[var(--brand-700)] hover:underline"
      >
        Review catalogue plan
      </Link>
    );
  }

  if (item.resolutionState === "MISSING_OBSERVED_HANDLE") {
    return <span className="text-gray-400">Cannot resolve safely</span>;
  }

  return (
    <Link
      href={withParamUpdates("/billing", params, {
        view: "unmapped",
        subscriptionId: item.id,
        mappingResolved: null,
      })}
      className="font-semibold text-[var(--brand-700)] hover:underline"
    >
      Resolve
    </Link>
  );
}

export function BillingUnmappedSubscriptions({
  subscriptions,
  params,
}: {
  subscriptions: PageResult<UnmappedSubscriptionItem>;
  params: Record<string, string>;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-5 py-4">
        <h2 className="text-lg font-semibold text-gray-950">
          Unmapped subscriptions
        </h2>
        <p className="mt-1 max-w-4xl text-sm text-gray-500">
          These subscriptions cannot be projected because the exact Shopify plan
          handle does not currently resolve to a valid operational billing plan.
          Repair the global exact-handle mapping; do not assign a different plan
          to an individual shop.
        </p>
      </div>

      {subscriptions.items.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[
                  "Shop",
                  "Observed Shopify plan",
                  "Merchant catalogue",
                  "Operational mapping",
                  "Resolution",
                  "Last synced",
                  "Action",
                ].map((label) => (
                  <th
                    key={label}
                    className="px-5 py-3 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {subscriptions.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-3 text-sm">
                    <div className="font-medium text-gray-900">
                      {item.brandName ?? item.shopDomain}
                    </div>
                    <div className="text-xs text-gray-500">
                      {item.shopDomain}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-700">
                    {item.observedShopifyPlanHandle ?? "Not reported"}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-700">
                    {item.cataloguePlan ? (
                      <>
                        <div className="font-medium text-gray-900">
                          {item.cataloguePlan.displayName}
                        </div>
                        <div className="text-xs text-gray-500">
                          {item.cataloguePlan.isActive ? "Active" : "Inactive"}
                        </div>
                      </>
                    ) : (
                      "Missing"
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-700">
                    {item.operationalPlan ? (
                      <>
                        <div className="font-medium text-gray-900">
                          {item.operationalPlan.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {item.operationalPlan.active ? "Active" : "Inactive"}
                        </div>
                      </>
                    ) : (
                      "Missing"
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm">
                    <span
                      className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${resolutionTone(item.resolutionState)}`}
                    >
                      {resolutionLabel(item.resolutionState)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-sm text-gray-600">
                    {item.lastSyncedAt
                      ? item.lastSyncedAt.toLocaleString("en-GB", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "UTC",
                        })
                      : "Never"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-sm">
                    {stateAction(item, params)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-5 py-10 text-sm text-gray-500">
          No unmapped subscriptions require attention.
        </div>
      )}

      <Pagination
        pathname="/billing"
        params={{ ...params, view: "unmapped" }}
        page={subscriptions.page}
        totalPages={subscriptions.totalPages}
        totalItems={subscriptions.totalItems}
        pageParam="unmappedPage"
        resetParams={[
          "subscriptionId",
          "mappingResolved",
          "reconciliationDebugSubscriptionId",
        ]}
      />
    </section>
  );
}

function DetailValue({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm text-gray-900">
        {value ?? "Not recorded"}
      </dd>
    </div>
  );
}

function blocker(
  title: string,
  message: string,
  action?: { href: string; label: string },
) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p className="font-semibold">{title}</p>
      <p className="mt-1">{message}</p>
      {action ? (
        <Link
          href={action.href}
          className="mt-3 inline-flex font-semibold text-red-900 underline"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export function UnmappedSubscriptionDrawer({
  detail,
  params,
}: {
  detail: UnmappedSubscriptionDetail;
  params: Record<string, string>;
}) {
  const closeHref = withParamUpdates("/billing", params, {
    view: "unmapped",
    subscriptionId: null,
    mappingResolved: null,
  });
  const returnTo = withParamUpdates("/billing", params, {
    view: "unmapped",
    subscriptionId: null,
    mappingResolved: null,
  });

  const cataloguePlan = detail.cataloguePlan;
  const shopifyContract = detail.shopifyContract;
  const contractVerified = shopifyContract?.status === "VERIFIED";
  const monetaryOverrideAvailable =
    cataloguePlan?.planKind === "PAID_METERED" &&
    shopifyContract?.status === "MONETARY_MISMATCH";
  const contractAllowsRepair = contractVerified || monetaryOverrideAvailable;

  return (
    <AdminDetailDrawer
      title="Resolve unmapped subscription"
      closeHref={closeHref}
      size="wide"
    >
      <div className="space-y-6">
        <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-semibold">Shopify remains authoritative</p>
          <p className="mt-1">
            This workflow repairs the global BillingPlan for the exact Shopify
            handle shown below. It never assigns this shop to a different plan.
            After save, the subscription stays UNMAPPED until billing
            reconciliation re-reads Shopify and projects the subscription.
          </p>
        </div>

        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="text-base font-semibold text-gray-950">
            Subscription evidence
          </h3>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <DetailValue label="Shop" value={detail.shopDomain} />
            <DetailValue
              label="Observed Shopify plan handle"
              value={detail.observedShopifyPlanHandle}
            />
            <DetailValue
              label="Provider subscription id"
              value={detail.providerSubscriptionId}
            />
            <DetailValue
              label="Current state"
              value={resolutionLabel(detail.resolutionState)}
            />
            <DetailValue
              label="Last sync error"
              value={detail.lastSyncErrorCode}
            />
            <DetailValue
              label="Next reconciliation"
              value={detail.nextReconcileAt?.toISOString() ?? null}
            />
          </dl>
        </section>

        {!detail.observedShopifyPlanHandle
          ? blocker(
              "Provider plan handle is missing",
              "The subscription cannot be mapped safely until Shopify reports a plan handle. Do not choose a plan manually.",
            )
          : !cataloguePlan
            ? blocker(
                "No exact MerchantPricing plan exists",
                `Register the Shopify handle “${detail.observedShopifyPlanHandle}” in the Merchant Pricing catalogue before resolving this subscription.`,
                {
                  href: buildUrl("/billing", {
                    view: "plans",
                    drawer: "register-plan",
                  }),
                  label: "Register catalogue plan",
                },
              )
            : !cataloguePlan.isActive
              ? blocker(
                  "The exact catalogue plan is inactive",
                  `The MerchantPricing plan “${cataloguePlan.displayName}” must be active before it can become an operational mapping.`,
                  {
                    href: buildUrl("/billing", {
                      view: "plans",
                      planId: cataloguePlan.id,
                    }),
                    label: "Review catalogue plan",
                  },
                )
              : null}

        {cataloguePlan ? (
          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <h3 className="text-base font-semibold text-gray-950">
              Exact catalogue match
            </h3>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <DetailValue label="Plan" value={cataloguePlan.displayName} />
              <DetailValue
                label="Shopify handle"
                value={cataloguePlan.shopifyPlanHandle}
              />
              <DetailValue label="Kind" value={cataloguePlan.planKind} />
              <DetailValue
                label="Included recovery credits"
                value={cataloguePlan.includedRecoveryCredits}
              />
            </dl>
          </section>
        ) : null}

        {cataloguePlan ? (
          <section className={`rounded-lg border p-5 ${
            shopifyContract?.status === "VERIFIED"
              ? "border-green-200 bg-green-50"
              : shopifyContract?.status === "MONETARY_MISMATCH"
                ? "border-amber-200 bg-amber-50"
                : shopifyContract?.status === "MISMATCH"
                  ? "border-red-200 bg-red-50"
                  : "border-amber-200 bg-amber-50"
          }`}>
            <h3 className="text-base font-semibold text-gray-950">
              Shopify contract validation
            </h3>
            <p className="mt-1 text-sm text-gray-700">
              {shopifyContract?.status === "VERIFIED"
                ? "VERIFIED — the exact Shopify plan identity is valid. Optional/top-up usage-event prices are not part of the mapping gate."
                : shopifyContract?.status === "MONETARY_MISMATCH"
                  ? "MONETARY MISMATCH — the exact paid-plan identity is valid, but the recurring amount or currency differs. A SUPER_ADMIN may explicitly override this monetary mismatch below."
                  : shopifyContract?.status === "MISMATCH"
                    ? "MISMATCH — repair is blocked because the Shopify plan identity or another non-monetary contract requirement does not match."
                    : "UNAVAILABLE — repair is blocked until the current Shopify contract can be verified."}
            </p>
            {shopifyContract?.mismatches.length ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-800">
                {shopifyContract.mismatches.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : null}
            {shopifyContract?.providerItems.length ? (
              <div className="mt-4">
                <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Shopify subscription items</p>
                <ul className="mt-2 space-y-1 text-sm text-gray-800">
                  {shopifyContract.providerItems.map((item) => (
                    <li key={`${item.handle}-${item.pricingType}`}>
                      <span className="font-medium">{item.handle}</span> — {item.pricingType} · {item.currency}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        {detail.operationalPlan ? (
          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <h3 className="text-base font-semibold text-gray-950">
              Current operational mapping
            </h3>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <DetailValue label="Name" value={detail.operationalPlan.name} />
              <DetailValue label="Kind" value={detail.operationalPlan.kind} />
              <DetailValue
                label="Primary usage meter"
                value={detail.operationalPlan.shopifyUsageEventHandle}
              />
              <DetailValue
                label="Included recovery allowance"
                value={
                  detail.operationalPlan.includedRecoveryConversationAllowance
                }
              />
            </dl>
          </section>
        ) : null}

        {cataloguePlan?.isActive ? (
          <form
            action={resolveUnmappedSubscriptionAction}
            className="space-y-5 rounded-lg border border-gray-200 bg-gray-50 p-5"
          >
            <input type="hidden" name="subscriptionId" value={detail.id} />
            <input type="hidden" name="returnTo" value={returnTo} />

            <div>
              <h3 className="text-base font-semibold text-gray-950">
                Operational mapping
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                The BillingPlan is projected deterministically from the active
                MerchantPricing catalogue plan after the verified Shopify
                contract check.
              </p>
            </div>

            <dl className="grid gap-4 rounded-md border border-gray-200 bg-white p-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Recovery usage-event handle
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {cataloguePlan.shopifyRecoveryUsageEventHandle ?? "None"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Supported catalogue features
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {cataloguePlan.features.join(", ") || "None"}
                </dd>
              </div>
            </dl>

            <label className="block text-sm font-medium text-gray-700">
              Resolution reason
              <textarea
                name="reason"
                required
                maxLength={1000}
                rows={3}
                placeholder="Explain why this operational mapping is being created or repaired."
                className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm"
              />
            </label>


            {monetaryOverrideAvailable ? (
              <label className="flex gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                <input
                  type="checkbox"
                  name="monetaryMismatchOverride"
                  value="1"
                  required
                  className="mt-0.5 h-4 w-4 rounded border-amber-400"
                />
                <span>
                  <span className="block font-semibold">
                    Override paid-tier monetary mismatch
                  </span>
                  <span className="mt-1 block">
                    I have reviewed the live Shopify recurring amount/currency
                    mismatch and approve repairing the exact-handle operational
                    mapping anyway. Shopify remains authoritative for live
                    monetary values.
                  </span>
                </span>
              </label>
            ) : null}

            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Saving repairs the global exact-handle BillingPlan and requests
              reconciliation. It does not directly set this subscription to ACTIVE
              or assign planId; Shopify will be re-read by billing reconciliation.
            </div>

            <button
              type="submit"
              disabled={!contractAllowsRepair}
              className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Repair mapping and request reconciliation
            </button>
          </form>
        ) : null}
      </div>
    </AdminDetailDrawer>
  );
}
