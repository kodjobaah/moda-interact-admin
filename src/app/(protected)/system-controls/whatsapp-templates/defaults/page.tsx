import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";
import { loadRecoveryTemplateDefaults } from "@/app/actions/whatsapp-recovery-template-defaults";
import { RECOVERY_DEFAULT_LABELS } from "@/lib/admin/whatsapp-templates/recovery-defaults/contracts";

export const dynamic = "force-dynamic";
export default async function WhatsAppRecoveryDefaultsPage() {
  const principal = await requirePlatformAdminPage();
  if (principal.role !== "SUPER_ADMIN") notFound();
  const result = await loadRecoveryTemplateDefaults();
  return <AdminShell active="whatsapp-templates">
    <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-8">
      <Link href="/system-controls/whatsapp-templates" className="text-sm font-medium text-blue-800 underline">← WhatsApp templates</Link>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Platform recovery defaults</h1>
      <p className="my-4 text-sm text-slate-600">These are the configured definitions for future merchant onboarding. Each covers all 20 supported languages. Select a replacement from the template catalogue. Publication to existing shops is a separate operation.</p>
      {!result.ok ? <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{result.message}</p> : <>
        <p className="mb-3 text-sm text-slate-600">Configured WABA: {result.data.wabaId}</p>
        <div className="overflow-x-auto rounded-lg border bg-white"><table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50"><tr><th scope="col" className="p-3">Recovery purpose</th><th scope="col" className="p-3">Configured default</th><th scope="col" className="p-3">Definition status</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{result.data.slots.map(({ purpose, current }) => <tr key={purpose}>
            <th scope="row" className="p-3 font-medium">{RECOVERY_DEFAULT_LABELS[purpose]}</th>
            <td className="p-3">{current ? <Link className="break-all text-blue-800 underline" href={`/system-controls/whatsapp-templates/${encodeURIComponent(current.definitionId)}/publish#recovery-default`}>{current.providerTemplateName ?? current.definitionId}</Link> : <span className="text-amber-800">Not configured</span>}</td>
            <td className="p-3">{current?.definitionStatus ?? "—"}</td>
          </tr>)}</tbody>
        </table></div>
        <p className="mt-3 text-xs text-slate-500">Configured does not guarantee current Meta approval. Open a definition and review it to check eligibility again.</p>
      </>}
      <Link href="/system-controls/whatsapp-templates?kind=META_RECOVERY" className="mt-5 inline-block rounded bg-blue-800 px-4 py-2 text-sm font-semibold text-white">Choose a recovery template</Link>
    </main>
  </AdminShell>;
}
