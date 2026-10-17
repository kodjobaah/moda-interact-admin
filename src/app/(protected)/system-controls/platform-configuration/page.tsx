import { AdminShell } from "@/components/admin/admin-shell";
import { ConfigurationEditor } from "@/components/admin/platform-configuration/configuration-editor";
import { ConfigurationNavigation } from "@/components/admin/platform-configuration/configuration-navigation";
import { ConfigurationHistoryPanel } from "@/components/admin/platform-configuration/configuration-history";
import { publicContracts } from "@/lib/admin/platform-configuration/contracts";
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
  const key = params.key ?? publicContracts()[0].key;
  const data = await configurationPageData(key, params.cursor);
  const selected = data.contracts.find((contract) => contract.key === key)!;
  return <AdminShell active="platform-configuration">
    <div className="flex-1 overflow-auto p-4 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header><h1 className="text-2xl font-bold text-[var(--brand-900)]">Platform Configuration</h1>
          <p className="mt-2 text-sm text-gray-600">Validated, revision-controlled platform policies. Deployment: <strong>{data.environment}</strong>. Only this deployment can be edited.</p></header>
        <ConfigurationNavigation contracts={data.contracts} selectedKey={key}/>
        <ConfigurationEditor key={`${key}:${data.snapshot.version}`} contract={selected} snapshot={data.snapshot}/>
        <ConfigurationHistoryPanel history={data.history} keyName={key}/>
      </div>
    </div>
  </AdminShell>;
}
