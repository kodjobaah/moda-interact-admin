import { AdminShell } from "@/components/admin/admin-shell";
import { EmbeddingConfigurationsPanel } from "@/components/admin/embedding-configuration/embedding-configurations-panel";
import { getEmbeddingConfigurationStatuses } from "@/lib/admin/embedding-configuration";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";

export const dynamic = "force-dynamic";

export default async function EmbeddingsPage() {
  const principal = await requirePlatformAdminPage();
  const statuses = await getEmbeddingConfigurationStatuses();

  return (
    <AdminShell active="embeddings">
      <div className="flex-1 overflow-auto p-4 sm:p-8">
        <EmbeddingConfigurationsPanel
          statuses={statuses}
          canMutate={principal.role === "SUPER_ADMIN"}
        />
      </div>
    </AdminShell>
  );
}
