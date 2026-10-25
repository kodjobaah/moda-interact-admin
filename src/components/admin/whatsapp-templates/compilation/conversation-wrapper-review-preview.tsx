import type { TemplatePreviewDTO } from "@/lib/admin/whatsapp-templates/authoring/types";
import { TemplateReadOnlyPreview } from "../authoring/template-read-only-preview";

export function ConversationWrapperReviewPreview({ preview, languageTag }: { preview: TemplatePreviewDTO; languageTag: string }) {
  return <div aria-label={`${languageTag} conversation wrapper preview`}>
    <TemplateReadOnlyPreview preview={preview} title={`${languageTag} — conversation wrapper`} localeLanguageTag={languageTag} />
    <p className="mt-2 text-xs text-slate-600">The AI/human response slot and checkout-aware conditional are structural, not translated content.</p>
  </div>;
}
