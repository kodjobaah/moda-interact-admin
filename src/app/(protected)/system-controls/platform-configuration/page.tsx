import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { ConfigurationEditor } from "@/components/admin/platform-configuration/configuration-editor";
import { ConfigurationNavigation } from "@/components/admin/platform-configuration/configuration-navigation";
import { ConfigurationHistoryPanel } from "@/components/admin/platform-configuration/configuration-history";
import { publicContracts, PLATFORM_CONFIGURATION_REGISTRY } from "@/lib/admin/platform-configuration/contracts";
import { secretConfigurationPageData } from "@/lib/admin/platform-configuration/secret-service";
import { SecretConfigurationEditor } from "@/components/admin/platform-configuration/secret-configuration-editor";
import { configurationPageData } from "@/lib/admin/platform-configuration/service";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";

export const dynamic = "force-dynamic";

export default async function PlatformConfigurationPage({ searchParams }: {
  searchParams: Promise<{ key?: string; cursor?: string }>;
}) {
  const principal = await requirePlatformAdminPage();
  const params = await searchParams;
  if (principal.role !== "SUPER_ADMIN") {
    return <AdminShell active="platform-configuration"><div role="alert" className="p-8">SUPER_ADMIN access is required.</div></AdminShell>;
  }
  const contracts = publicContracts(PLATFORM_CONFIGURATION_REGISTRY, true);
  const key = params.key ?? contracts[0]?.key;
  if (!key) notFound();
  const selected = contracts.find((contract) => contract.key === key);
  if (!selected) notFound();
  const isSecret = selected.kind === "secret";
  const data = isSecret ? await secretConfigurationPageData(key, params.cursor) : await configurationPageData(key, params.cursor);
  return <AdminShell active="platform-configuration">
    <div className="flex-1 overflow-auto p-4 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header><h1 className="text-2xl font-bold text-[var(--brand-900)]">Platform Configuration</h1>
          <p className="mt-2 text-sm text-gray-600">Validated, revision-controlled platform policies. Deployment: <strong>{data.environment}</strong>. Only this deployment can be edited.</p></header>
        <ConfigurationNavigation contracts={contracts} selectedKey={key}/>
        {isSecret ? <SecretConfigurationEditor key={`${key}:${"status" in data ? data.status.version : 0}`} contract={selected} status={"status" in data ? data.status : { key, version: 0, configured: false, updatedAt: null, updatedBy: null }} />
          : "snapshot" in data ? <ConfigurationEditor key={`${key}:${data.snapshot.version}`} contract={selected} snapshot={data.snapshot} /> : null}
        <ConfigurationHistoryPanel history={data.history} keyName={key} secret={isSecret}/>
      </div>
    </div>
  </AdminShell>;
}
