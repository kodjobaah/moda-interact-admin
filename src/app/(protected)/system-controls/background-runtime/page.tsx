import { getBackgroundRuntimeConfig } from "@/app/actions/background-runtime-controls";
import { AdminShell } from "@/components/admin/admin-shell";
import { BackgroundRuntimeControls } from "@/components/admin/background-runtime-controls";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";

export const dynamic = "force-dynamic";

export default async function BackgroundRuntimePage() {
  await requirePlatformAdminPage();
  const config = await getBackgroundRuntimeConfig();

  return (
    <AdminShell active="background-runtime">
      <div className="flex-1 overflow-auto p-4 sm:p-8">
        <BackgroundRuntimeControls config={config} />
      </div>
    </AdminShell>
  );
}
