import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TranslationProgressSummary } from "../../src/components/admin/whatsapp-templates/translations/translation-progress-summary.tsx";
import { TranslationRequestControls } from "../../src/components/admin/whatsapp-templates/translations/translation-request-controls.tsx";
import { TranslationLocaleStatusList } from "../../src/components/admin/whatsapp-templates/translations/translation-locale-status-list.tsx";
import { projectTranslationProgress } from "../../src/lib/admin/whatsapp-templates/translations/progress.ts";

const state = projectTranslationProgress({ definitionId: "wtdef_" + "a".repeat(64), family: "META_RECOVERY", purpose: "INITIAL",
  sourceHash: "a".repeat(64), definitionStatus: "SAVED" });

test("progress explicitly presents English source separately from the 19 target results", () => {
  const html = renderToStaticMarkup(createElement(TranslationProgressSummary, { state }));
  assert.match(html, /English source/);
  assert.match(html, /1 \/ 1/);
  assert.match(html, /0 \/ 19/);
});

test("Generate and retry actions have distinct enabled states", () => {
  const html = renderToStaticMarkup(createElement(TranslationRequestControls, {
    state, busy: false, onGenerate: () => {}, onRetry: () => {}, onRefresh: () => {},
  }));
  assert.match(html, /Generate translations/);
  assert.match(html, /Retry failed or pending/);
  assert.match(html, /disabled=""[^>]*>Retry/);
});

test("locale list is paginated, accessible and never displays customer values", () => {
  const html = renderToStaticMarkup(createElement(TranslationLocaleStatusList, {
    targets: state.targets, selected: null, onSelect: () => {},
  }));
  assert.match(html, /Target languages \(19\)/);
  assert.match(html, /Page 1 of 3/);
  assert.ok(!html.includes("Alex"));
});
