import { AdminShell } from "@/components/admin/admin-shell";
import { PlatformBillingControls } from "@/components/admin/billing-controls";
import { adminI18n } from "@/i18n";
import { getPlatformBillingPolicy } from "@/lib/admin/billing-controls";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";

export const dynamic = "force-dynamic";

export default async function BillingControlsPage() {
  await requirePlatformAdminPage();
  const policy = await getPlatformBillingPolicy();
  return (
    <AdminShell active="billing">
      <div className="flex-1 overflow-auto p-4 sm:p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[var(--brand-900)]">
            {adminI18n.t("billingControls.platformTitle")}
          </h1>
        </div>
        <PlatformBillingControls policy={policy} />
      </div>
    </AdminShell>
  );
}
