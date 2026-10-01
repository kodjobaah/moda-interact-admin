import { AdminShell } from "@/components/admin/admin-shell";
import { OpenRouterCredentialPanel } from "@/components/admin/openrouter-credential/openrouter-credential-panel";
import { getOpenRouterCredentialStatus } from "@/lib/admin/openrouter-credential";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";

export const dynamic = "force-dynamic";

export default async function OpenRouterCredentialsPage() {
  const principal = await requirePlatformAdminPage();
  const status = await getOpenRouterCredentialStatus();

  return (
    <AdminShell active="openrouter-credentials">
      <div className="flex-1 overflow-auto p-4 sm:p-8">
        <OpenRouterCredentialPanel
          status={status}
          canMutate={principal.role === "SUPER_ADMIN"}
        />
      </div>
    </AdminShell>
  );
}
