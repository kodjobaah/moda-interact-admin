import Link from "next/link";
import { validateTemplateAst } from "@/lib/admin/whatsapp-templates/authoring/validation";
import { makeExamplePreview } from "@/lib/admin/whatsapp-templates/authoring/preview";
import type { TemplateDetail } from "@/lib/admin/whatsapp-templates/authoring/types";
import { TemplateReadOnlyPreview } from "./template-read-only-preview";

export function TemplateSavedDetail({ detail }: { detail: TemplateDetail }) {
  const preview = detail.english?.authoring && validateTemplateAst(detail.english.authoring).ok && detail.english.prepared
    ? makeExamplePreview(detail.english.prepared) : null;
  return <article className="space-y-4 rounded-lg border bg-white p-4" aria-label="Saved immutable template">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Saved definition (read only)</h2>
      {detail.english && <div className="flex flex-wrap gap-2">
        <Link className="rounded border border-blue-800 px-3 py-2 text-sm text-blue-800" href={`/system-controls/whatsapp-templates/${encodeURIComponent(detail.id)}/translations`}>Translations</Link>
        <Link className="rounded bg-blue-800 px-3 py-2 text-sm text-white" href={`/system-controls/whatsapp-templates?clone=${encodeURIComponent(detail.id)}`}>Clone as New</Link>
      </div>}
    </div>
    <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
      <div><dt className="text-gray-500">Identity</dt><dd className="break-all font-mono text-xs">{detail.id}</dd></div>
      <div><dt className="text-gray-500">Lifecycle</dt><dd>{detail.status}</dd></div>
      <div><dt className="text-gray-500">Family</dt><dd>{detail.kind}</dd></div>
      <div><dt className="text-gray-500">Purpose / audience</dt><dd>{detail.kind === "META_RECOVERY" ? `${detail.purpose}/${detail.offerType}` : detail.audience}</dd></div>
      <div><dt className="text-gray-500">Source language</dt><dd>{detail.sourceLanguageTag}</dd></div>
      <div><dt className="text-gray-500">Provider name</dt><dd className="break-all">{detail.providerTemplateName || "Not applicable (internal)"}</dd></div>
      <div className="sm:col-span-2"><dt className="text-gray-500">Source SHA-256</dt><dd className="break-all font-mono text-xs">{detail.sourceHash}</dd></div>
    </dl>
    {detail.english ? <TemplateReadOnlyPreview preview={preview} /> : <p role="alert" className="text-sm text-red-700">English locale unavailable. No edits are permitted here.</p>}
  </article>;
}
