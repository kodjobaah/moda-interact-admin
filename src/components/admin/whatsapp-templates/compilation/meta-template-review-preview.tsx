import type { TemplatePreviewDTO } from "@/lib/admin/whatsapp-templates/authoring/types";
import { TemplateReadOnlyPreview } from "../authoring/template-read-only-preview";

export function MetaTemplateReviewPreview({ preview, languageTag }: { preview: TemplatePreviewDTO; languageTag: string }) {
  return <div aria-label={`${languageTag} Meta template preview`}>
    <TemplateReadOnlyPreview preview={preview} title={`${languageTag} — Meta recovery message`} localeLanguageTag={languageTag} />
    <p className="mt-2 text-xs text-slate-600">Provider header, body, static footer and buttons are compiled from this language.</p>
  </div>;
}
