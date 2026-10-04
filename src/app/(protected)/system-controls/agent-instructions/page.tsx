import { AdminShell } from "@/components/admin/admin-shell";
import { AgentInstructionsConsole } from "@/components/admin/agent-instructions/agent-instructions-console";
import { getAgentInstructionsData } from "@/lib/admin/agent-instructions";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ shop?: string; q?: string; tab?: string }> };

export default async function AgentInstructionsPage({ searchParams }: PageProps) {
  await requirePlatformAdminPage();
  const params = await searchParams;
  const data = await getAgentInstructionsData({ shopId: params.shop, shopSearch: params.q });
  return (
    <AdminShell active="agent-instructions">
      <div className="flex-1 overflow-auto p-4 sm:p-8">
        <AgentInstructionsConsole data={data} initialTab={params.tab === "shop" || params.shop ? "shop" : "platform"} />
      </div>
    </AdminShell>
  );
}