import { hasMetaProviderDrift, type MetaStatusView } from "@/lib/admin/whatsapp-templates/meta/contracts";

export function MetaApprovalSummary({ status }: { status: MetaStatusView }) {
  const rows = status.registrations;
  const approved = rows.filter((row) => row.providerStatus === "APPROVED" && !hasMetaProviderDrift(row)).length;
  const rejected = rows.filter((row) => row.providerStatus === "REJECTED").length;
  const paused = rows.filter((row) => row.providerStatus === "PAUSED" || row.providerStatus === "DISABLED").length;
  const attempted = rows.filter((row) => row.lastSubmittedAt).length;
  const drifted = rows.filter(hasMetaProviderDrift).length;
  return <section className="rounded-xl border bg-white p-4" aria-label="Provider approval summary">
    <h2 className="text-lg font-semibold">Provider status (not merchant publication)</h2>
    <div className="mt-3 grid gap-3 sm:grid-cols-3 xl:grid-cols-6 text-sm">
      {[ ["Registered", rows.length], ["Meta create attempted", attempted], ["Meta approved / no drift", approved],
        ["Rejected", rejected], ["Paused or disabled", paused], ["Content drift", drifted] ].map(([label, count]) =>
        <div key={label} className="rounded border bg-slate-50 p-3"><strong className="block text-xl">{count}</strong><span>{label}</span></div>)}
    </div>
    <p className="mt-3 text-sm text-slate-600">A successful create request is not approval. Each language requires its own APPROVED provider status and no drift. Publication is a separate Admin operation.</p>
  </section>;
}
