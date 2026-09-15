import Link from "next/link";
import { mutateMerchantPricingPlanAction } from "@/app/actions/merchant-pricing-plan";
import type { MerchantPricingPlanWithChildren } from "@/lib/admin/merchant-pricing-plan";
import { adminI18n } from "@/i18n";

export function MerchantPricingPlanCatalog({
  plans,
}: {
  plans: MerchantPricingPlanWithChildren[];
}) {
  return (
    <div className="space-y-4">
      <section className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">
            MerchantPricing catalogue
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            ARCH-014 informational merchant pricing plans.
          </p>
        </div>
        <Link
          href="/billing?view=plans&drawer=register-plan"
          className="rounded-md bg-[var(--brand-700)] px-3 py-2 text-sm font-semibold text-white"
        >
          Register plan
        </Link>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        {plans.map((plan) => (
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
                <dt className="text-xs text-gray-500">Catalogue position</dt>
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
                <dt className="text-xs text-gray-500">Included credits</dt>
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
            </dl>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700"
                href={`/billing?view=plans&planId=${encodeURIComponent(plan.id)}`}
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
              </form>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
