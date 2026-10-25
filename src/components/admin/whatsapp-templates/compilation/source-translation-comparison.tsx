import type { ReviewLocaleDTO } from "@/lib/admin/whatsapp-templates/compilation/contracts";
import { MetaTemplateReviewPreview } from "./meta-template-review-preview";
import { ConversationWrapperReviewPreview } from "./conversation-wrapper-review-preview";

function Preview({ locale }: { locale: ReviewLocaleDTO }) {
  if (!locale.preview) return <p role="status" className="rounded border p-4 text-sm text-slate-700">
    {locale.reason || "No validated preview is available for this language."}
  </p>;
  return locale.preview.family === "META_RECOVERY"
    ? <MetaTemplateReviewPreview preview={locale.preview} languageTag={locale.languageTag} />
    : <ConversationWrapperReviewPreview preview={locale.preview} languageTag={locale.languageTag} />;
}

export function SourceTranslationComparison({ source, translation }: {
  source: ReviewLocaleDTO; translation: ReviewLocaleDTO;
}) {
  return <section aria-label="English and translation comparison" className="grid min-w-0 gap-4 xl:grid-cols-2">
    <div className="min-w-0"><Preview locale={source} /></div>
    <div className="min-w-0"><Preview locale={translation} /></div>
  </section>;
}
