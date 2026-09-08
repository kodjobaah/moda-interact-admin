import { AdminShell } from "@/components/admin/admin-shell";
import { BillingPlanCatalog } from "@/components/admin/billing-plan-catalog";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";
import { getBillingPlans } from "@/lib/admin/billing-plan";
import { adminI18n } from "@/i18n";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  await requirePlatformAdminPage();
  const plans = await getBillingPlans();

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
        <BillingPlanCatalog plans={plans} />
      </div>
    </AdminShell>
  );
}
