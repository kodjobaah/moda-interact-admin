import Link from "next/link";
import { mutateMerchantPricingPlanAction } from "@/app/actions/merchant-pricing-plan";
import { Pagination } from "@/components/admin/pagination";
import {
  MERCHANT_PRICING_CATALOGUE_PAGE_SIZES,
  type MerchantPricingPlanWithChildren,
} from "@/lib/admin/merchant/pricing-plan";
import { withParamUpdates } from "@/lib/admin/query";
import type { PageResult } from "@/lib/admin/types";
import { MerchantPricingPlanDeleteButton } from "./merchant-pricing-plan-delete-button";
import { adminI18n } from "@/i18n";

export function MerchantPricingPlanCatalog({
  plans,
  params,
}: {
  plans: PageResult<MerchantPricingPlanWithChildren>;
  params: Record<string, string>;
}) {
  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">
            Merchant Pricing catalogue
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Create and manage your merchant pricing plans.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <form method="get" className="flex items-end gap-2">
            <input type="hidden" name="view" value="plans" />
            <label className="text-xs font-semibold text-gray-600">
              Plans per page
              <select
                name="planPageSize"
                defaultValue={plans.pageSize}
                className="mt-1 block rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-normal"
              >
                {MERCHANT_PRICING_CATALOGUE_PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Apply
            </button>
          </form>
          <Link
            href={withParamUpdates("/billing", params, {
              view: "plans",
              drawer: "register-plan",
              planId: null,
              pricingError: null,
            })}
            className="rounded-md bg-[var(--brand-700)] px-3 py-2 text-sm font-semibold text-white"
          >
            Register plan
          </Link>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="max-h-[calc(100vh-20rem)] min-h-64 overflow-y-auto p-4">
          {plans.items.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {plans.items.map((plan) => (
                <article
                  key={plan.id}
                  className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-950">
                        {plan.displayName}
                      </h2>
                      <p className="font-mono text-xs text-gray-500">
                        {plan.shopifyPlanHandle}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${plan.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}
                    >
                      {plan.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <dl className="mt-5 grid gap-3 border-t border-gray-100 pt-4 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-gray-500">
                        Catalogue position
                      </dt>
                      <dd>{plan.cataloguePosition}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">Kind</dt>
                      <dd>{plan.planKind}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">Recurring</dt>
                      <dd>
                        {new Intl.NumberFormat(undefined, {
                          style: "currency",
                          currency: plan.currency,
                        }).format(plan.recurringAmountMinor / 100)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">
                        Included credits
                      </dt>
                      <dd>
                        {adminI18n.formatNumber(plan.includedRecoveryCredits)} /{" "}
                        {plan.allowancePeriod}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">Usage events</dt>
                      <dd>{plan.usageEvents.length}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">Translations</dt>
                      <dd>{plan.translations.length}/20</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-gray-500">Operational status</dt>
                      <dd>
                        {plan.materializedAt
                          ? `Durable since ${adminI18n.formatDateTime(plan.materializedAt)}`
                          : "Not yet materialised"}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700"
                      href={withParamUpdates("/billing", params, {
                        view: "plans",
                        planId: plan.id,
                        drawer: null,
                        pricingError: null,
                      })}
                    >
                      Edit plan
                    </Link>
                    <form action={mutateMerchantPricingPlanAction}>
                      <input type="hidden" name="intent" value="toggle" />
                      <input type="hidden" name="id" value={plan.id} />
                      <input
                        type="hidden"
                        name="reason"
                        value={
                          plan.isActive
                            ? "Deactivated from MerchantPricing catalogue"
                            : "Activated in MerchantPricing catalogue"
                        }
                      />
                      <button
                        type="submit"
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700"
                      >
                        {plan.isActive ? "Deactivate" : "Activate"}
                      </button>
                      {plan.planKind === "PAID_METERED" ? (
                        <MerchantPricingPlanDeleteButton
                          id={plan.id}
                          displayName={plan.displayName}
                          disabled={plan.isActive || Boolean(plan.materializedAt)}
                          durable={Boolean(plan.materializedAt)}
                        />
                      ) : null}
                    </form>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-gray-300 p-8 text-sm text-gray-600">
              No merchant pricing plans are registered yet.
            </p>
          )}
        </div>

        <Pagination
          pathname="/billing"
          params={params}
          page={plans.page}
          totalPages={plans.totalPages}
          totalItems={plans.totalItems}
          pageParam="planPage"
          resetParams={["planId", "drawer", "pricingError"]}
        />
      </section>
    </div>
  );
}
