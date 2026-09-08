import { AdminShell } from "@/components/admin/admin-shell";
import { BillingPlanCatalog } from "@/components/admin/billing-plan-catalog";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";
import { getBillingPlans } from "@/lib/admin/billing-plan";
import { getBillingLedger, getBillingOverview } from "@/lib/admin/billing";
import { adminI18n } from "@/i18n";
import {
  BillingLedger,
  BillingOverviewCards,
} from "@/components/admin/billing-overview";
import {
  firstParam,
  paramsToRecord,
  positiveInt,
  type SearchParamRecord,
} from "@/lib/admin/query";
import { ShopifyReportState } from "@prisma/client";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<SearchParamRecord> };

export default async function BillingPage({ searchParams }: PageProps) {
  await requirePlatformAdminPage();
  const rawParams = await searchParams;
  const params = paramsToRecord(rawParams);
  const rawState = firstParam(rawParams.state);
  const state = Object.values(ShopifyReportState).includes(
    rawState as ShopifyReportState,
  )
    ? (rawState as ShopifyReportState)
    : undefined;
  const [plans, overview, ledger] = await Promise.all([
    getBillingPlans(),
    getBillingOverview(),
    getBillingLedger({
      page: positiveInt(rawParams.ledgerPage),
      pageSize: 20,
      state,
      shopId: firstParam(rawParams.shopId),
      from: firstParam(rawParams.from),
      to: firstParam(rawParams.to),
    }),
  ]);

  return (
    <AdminShell active="billing">
      <div className="flex-1 overflow-auto p-4 sm:p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[var(--brand-900)]">
            {adminI18n.t("billing.title")}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            {adminI18n.t("billing.description")}
          </p>
        </div>
        <BillingOverviewCards overview={overview} />
        <BillingLedger ledger={ledger} params={params} />
        <div className="my-8" />
        <BillingPlanCatalog plans={plans} />
      </div>
    </AdminShell>
  );
}
