import { AdminShell } from "@/components/admin/admin-shell";
import { TranslationConfigurationsPanel } from "@/components/admin/translation-configuration/translation-configurations-panel";
import { getTranslationConfigurationAdminData } from "@/lib/admin/translation-configuration";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";

export const dynamic = "force-dynamic";

export default async function TranslationsPage() {
  const principal = await requirePlatformAdminPage();
  const data = await getTranslationConfigurationAdminData();

  return (
    <AdminShell active="translations">
      <div className="flex-1 overflow-auto p-4 sm:p-8">
        <TranslationConfigurationsPanel
          data={data}
          canMutate={principal.role === "SUPER_ADMIN"}
        />
      </div>
    </AdminShell>
  );
}
