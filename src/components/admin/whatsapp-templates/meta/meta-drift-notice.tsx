import { hasMetaProviderDrift, type MetaStatusView } from "@/lib/admin/whatsapp-templates/meta/contracts";

export function MetaDriftNotice({ status }: { status: MetaStatusView }) {
  const drifted = status.registrations.filter(hasMetaProviderDrift);
  if (!drifted.length) return null;
  return <section role="alert" aria-label="Meta provider drift" className="rounded-xl border border-amber-400 bg-amber-50 p-4">
    <h2 className="font-semibold">Provider drift – publication blocked</h2>
    <p className="mt-1 text-sm">Meta&apos;s observed content or category differs from the frozen Moda registration. Reconcile status; do not edit or import a provider template.</p>
    <ul className="mt-2 list-inside list-disc text-sm">
      {drifted.map((row) => <li key={row.id}>{row.languageTag} ({row.providerLanguageCode}): provider drift; last checked {row.lastReconciledAt ?? "not recorded"}</li>)}
    </ul>
  </section>;
}
