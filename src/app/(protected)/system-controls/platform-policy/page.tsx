import { AdminShell } from "@/components/admin/admin-shell";
import { PlatformPolicyControls } from "@/components/admin/billing-controls";
import { getPlatformBillingPolicy } from "@/lib/admin/billing-controls";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";

export const dynamic = "force-dynamic";

export default async function PlatformPolicyPage() {
  await requirePlatformAdminPage();
  const policy = await getPlatformBillingPolicy();

  return (
    <AdminShell active="platform-policy">
      <div className="flex-1 overflow-auto p-4 sm:p-8">
        <PlatformPolicyControls policy={policy} />
      </div>
    </AdminShell>
  );
}
