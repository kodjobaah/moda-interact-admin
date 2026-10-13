import { AdminShell } from "@/components/admin/admin-shell";
import { PlatformPolicyControls } from "@/components/admin/billing-controls";
import { LivePlatformPolicyControls } from "@/components/admin/commerce-model-policy/live-platform-policy";
import { getPlatformBillingPolicy } from "@/lib/admin/billing-controls";
import { getLivePlatformPolicyDashboard } from "@/lib/admin/commerce-model-platform-policy";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";

export const dynamic = "force-dynamic";

export default async function PlatformPolicyPage({
  searchParams,
}: {
  searchParams: Promise<{ commerceHistoryPage?: string }>;
}) {
  const principal = await requirePlatformAdminPage();
  const rawPage = (await searchParams).commerceHistoryPage ?? "0";
  const page = /^\d{1,4}$/.test(rawPage) ? Math.min(Number(rawPage), 1000) : 0;
  const [policy, commercePolicy] = await Promise.all([
    getPlatformBillingPolicy(),
    principal.role === "SUPER_ADMIN" ? getLivePlatformPolicyDashboard(page) : null,
  ]);

  return (
    <AdminShell active="platform-policy">
      <div className="flex-1 overflow-auto p-4 sm:p-8">
        <PlatformPolicyControls policy={policy} />
        {commercePolicy && (
          <LivePlatformPolicyControls
            key={commercePolicy.policy ? `${commercePolicy.policy.id}:${commercePolicy.policy.editVersion}` : "missing"}
            policy={commercePolicy.policy}
            history={commercePolicy.history}
            page={page}
            hasMore={commercePolicy.hasMore}
            canEdit={principal.role === "SUPER_ADMIN"}
          />
        )}
      </div>
    </AdminShell>
  );
}
