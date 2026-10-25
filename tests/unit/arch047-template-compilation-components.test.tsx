import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { newMetaDraft, newWrapperDraft } from "../../src/lib/admin/whatsapp-templates/authoring/draft-operations.ts";
import { makeImmutableAuthoringRecord } from "../../src/lib/admin/whatsapp-templates/authoring/compiler.ts";
import { makeExamplePreview } from "../../src/lib/admin/whatsapp-templates/authoring/preview.ts";
import type { ReviewLocaleDTO } from "../../src/lib/admin/whatsapp-templates/compilation/contracts.ts";
import { ReviewLanguageSelector } from "../../src/components/admin/whatsapp-templates/compilation/review-language-selector.tsx";
import { SourceTranslationComparison } from "../../src/components/admin/whatsapp-templates/compilation/source-translation-comparison.tsx";
import { ComponentAndVariableDiff } from "../../src/components/admin/whatsapp-templates/compilation/component-and-variable-diff.tsx";
import { TranslationReviewActions } from "../../src/components/admin/whatsapp-templates/compilation/translation-review-actions.tsx";

function demo(kind: "META_RECOVERY" | "MODA_CONVERSATION_WRAPPER" = "META_RECOVERY") {
  const ast = kind === "META_RECOVERY" ? newMetaDraft() : newWrapperDraft();
  const compiled = makeImmutableAuthoringRecord(ast);
  const locale = (languageTag: string, status: ReviewLocaleDTO["status"]): ReviewLocaleDTO => ({
    languageTag, providerLanguageCode: languageTag, status, reason: null,
    preview: makeExamplePreview(compiled.prepared), authoring: compiled.authoring,
    prepared: compiled.prepared, contentHash: "a".repeat(64), reviewedAt: null, runId: languageTag === "en" ? null : "run-001",
  });
  return { english: locale("en", "SOURCE"), french: locale("fr", "READY") };
}

test("locale selector displays all twenty languages with pressed state and clear completion/failure labels", () => {
  const d = demo();
  const labels: ReviewLocaleDTO[] = [d.english, d.french, ...Array.from({ length: 18 }, (_, i) => ({ ...d.french,
    languageTag: `lang-${i}`, status: i === 0 ? "INVALID" as const : "WAITING" as const }))];
  const html = renderToStaticMarkup(<ReviewLanguageSelector locales={labels} selected="fr" onSelect={() => {}} />);
  assert.equal((html.match(/aria-pressed=/g) ?? []).length, 20);
  assert.match(html, /aria-label="Choose review language"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /INVALID/);
});

test("Meta and wrapper views display complete parallel previews, conditional and section-level semantic variables", () => {
  for (const family of ["META_RECOVERY", "MODA_CONVERSATION_WRAPPER"] as const) {
    const { english, french } = demo(family);
    const html = renderToStaticMarkup(<>
      <SourceTranslationComparison source={english} translation={french} />
      <ComponentAndVariableDiff source={english} translation={french} />
    </>);
    assert.match(html, /English and translation comparison/);
    assert.match(html, /Components and protected variable comparison/);
    assert.match(html, /Header — English/);
    assert.match(html, /Header — fr/);
    assert.match(html, family === "META_RECOVERY" ? /Meta recovery message/ : /conversation wrapper/);
    assert.match(html, family === "META_RECOVERY" ? /customer\.firstName/ : /response\.body/i);
  }
});

test("review controls never allow mutation of English source or approved locale; rejected/invalid states explained", () => {
  const { english, french } = demo();
  const forbidden = renderToStaticMarkup(<TranslationReviewActions locale={english} busy={false} message={null} onDecision={() => {}} />);
  assert.match(forbidden, /saved English source cannot be reviewed/);
  assert.equal((forbidden.match(/disabled=""/g) ?? []).length, 2);
  const allowed = renderToStaticMarkup(<TranslationReviewActions locale={french} busy={false} message={null} onDecision={() => {}} />);
  assert.match(allowed, /Approve and freeze/);
  assert.match(allowed, /Reject translation/);
  assert.ok(!allowed.includes('disabled=""'));
  const failed = renderToStaticMarkup(<TranslationReviewActions locale={{ ...french, status: "INVALID", preview: null,
    reason: "Missing protected marker." }} busy={false} message={null} onDecision={() => {}} />);
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Missing protected marker/);
  assert.equal((failed.match(/disabled=""/g) ?? []).length, 1);
});
