import { AdminShell } from "@/components/admin/admin-shell";
import { PlatformPolicyControls } from "@/components/admin/billing-controls";
import { McpExecutionPolicyControls } from "@/components/admin/mcp-execution-policy/mcp-execution-policy-controls";
import { readMcpExecutionPolicy, type McpExecutionPolicyDocument } from "@/lib/admin/mcp-execution-policy";
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

  let mcpDocument: McpExecutionPolicyDocument | null = null;
  let mcpError: string | null = null;
  if (principal.role === "SUPER_ADMIN" && policy) {
    try {
      mcpDocument = readMcpExecutionPolicy(policy.mcpExecutionPolicy);
    } catch {
      mcpError = "Stored MCP policy has an unsupported or invalid JSON structure. Editing is disabled until corrected.";
    }
  }

  return (
    <AdminShell active="platform-policy">
      <div className="flex-1 overflow-auto p-4 sm:p-8">
        <PlatformPolicyControls policy={policy} />
        {principal.role === "SUPER_ADMIN" && (
          <McpExecutionPolicyControls key={policy?.version ?? "missing"} version={policy?.version ?? null} document={mcpDocument} error={mcpError} />
        )}
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
