import { AdminShell } from "@/components/admin/admin-shell";
import { PlatformPolicyControls } from "@/components/admin/billing-controls";
import { McpExecutionPolicyControls } from "@/components/admin/mcp-execution-policy/mcp-execution-policy-controls";
import { readMcpExecutionPolicy, type McpExecutionPolicyDocument } from "@/lib/admin/mcp-execution-policy";
import { LivePlatformPolicyControls } from "@/components/admin/commerce-model-policy/live-platform-policy";
import { getPlatformBillingPolicy } from "@/lib/admin/billing-controls";
import { getLivePlatformPolicyDashboard } from "@/lib/admin/commerce-model-platform-policy";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";
import { PlatformPolicyTabs } from "@/components/admin/platform-policy-tabs";
import { ConfigurationEditor } from "@/components/admin/platform-configuration/configuration-editor";
import { ConfigurationHistoryPanel } from "@/components/admin/platform-configuration/configuration-history";
import { PLATFORM_POLICY_REGISTRY, publicContracts } from "@/lib/admin/platform-configuration/contracts";
import { configurationPageData } from "@/lib/admin/platform-configuration/service";

export const dynamic = "force-dynamic";

export default async function PlatformPolicyPage({
  searchParams,
}: {
  searchParams: Promise<{ commerceHistoryPage?: string }>;
}) {
  const principal = await requirePlatformAdminPage();
  const rawPage = (await searchParams).commerceHistoryPage ?? "0";
  const page = /^\d{1,4}$/.test(rawPage) ? Math.min(Number(rawPage), 1000) : 0;
  const [policy, commercePolicy, recoveryExecution] = await Promise.all([
    getPlatformBillingPolicy(),
    principal.role === "SUPER_ADMIN" ? getLivePlatformPolicyDashboard(page) : null,
    principal.role === "SUPER_ADMIN" ? configurationPageData("commerce.recoveryExecution") : null,
  ]);
  const recoveryExecutionContract = publicContracts(PLATFORM_POLICY_REGISTRY).find((contract) => contract.key === "commerce.recoveryExecution");

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
        <PlatformPolicyTabs
          billing={<PlatformPolicyControls policy={policy} />}
          mcp={principal.role === "SUPER_ADMIN" ? <McpExecutionPolicyControls key={policy?.version ?? "missing"} version={policy?.version ?? null} document={mcpDocument} error={mcpError} /> : <p>SUPER_ADMIN access is required.</p>}
          commerce={<div className="space-y-6">
            {recoveryExecution && recoveryExecutionContract && <>
              <ConfigurationEditor key={`${recoveryExecution.snapshot.version}`} contract={recoveryExecutionContract} snapshot={recoveryExecution.snapshot} />
              <ConfigurationHistoryPanel history={recoveryExecution.history} keyName="commerce.recoveryExecution" secret={false} />
            </>}
            {commercePolicy && <LivePlatformPolicyControls
              key={commercePolicy.policy ? `${commercePolicy.policy.id}:${commercePolicy.policy.editVersion}` : "missing"}
              policy={commercePolicy.policy} history={commercePolicy.history} page={page}
              hasMore={commercePolicy.hasMore} canEdit={principal.role === "SUPER_ADMIN"} />}
          </div>}
        />
      </div>
    </AdminShell>
  );
}
