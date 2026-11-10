import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { newMetaDraft, newWrapperDraft, setWrapperProductImage } from "../../src/lib/admin/whatsapp-templates/authoring/draft-operations.ts";
import { compileTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/compiler.ts";
import { makeExamplePreview } from "../../src/lib/admin/whatsapp-templates/authoring/preview.ts";
import { WrapperStructureEditor } from "../../src/components/admin/whatsapp-templates/authoring/wrapper-structure-editor.tsx";
import { TemplateContentEditor } from "../../src/components/admin/whatsapp-templates/authoring/template-content-editor.tsx";
import { TemplateReadOnlyPreview } from "../../src/components/admin/whatsapp-templates/authoring/template-read-only-preview.tsx";
import { ConversationWrapperReviewPreview } from "../../src/components/admin/whatsapp-templates/compilation/conversation-wrapper-review-preview.tsx";
import { WrapperBeforeAfterPreview } from "../../src/components/admin/whatsapp-templates/wrappers/wrapper-before-after-preview.tsx";
import { checkWrapperEligibility } from "../../src/lib/admin/whatsapp-templates/wrappers/eligibility.ts";
import { wrapperRow } from "../fixtures/arch047-wrapper-fixture.ts";
const noop = () => {};
const enabled = () => setWrapperProductImage(newWrapperDraft("AI"), true);

test("optional image control is accessible, default-off and AI-only; Meta editor retains its own image role", () => {
  const off = renderToStaticMarkup(<WrapperStructureEditor draft={newWrapperDraft("AI")} onChange={noop} />);
  assert.match(off, /Optional product image/); assert.doesNotMatch(off, /checked=""/);
  assert.match(off, /aria-describedby="optional-product-image-help"/);
  assert.match(off, /One verified product image above the response; omitted when unavailable/);
  const on = renderToStaticMarkup(<WrapperStructureEditor draft={enabled()} onChange={noop} />);
  assert.match(on, /checked=""/);
  for (const audience of ["HUMAN", "SHARED"] as const) assert.doesNotMatch(renderToStaticMarkup(<WrapperStructureEditor draft={newWrapperDraft(audience)} onChange={noop} />), /Optional product image/);
  assert.doesNotMatch(renderToStaticMarkup(<TemplateContentEditor draft={newMetaDraft()} onChange={noop} />), /optional-product-image-help/);
});

test("authoring and locale review show a local image illustration above the complete caption without external resources", () => {
  const preview = makeExamplePreview(compileTemplateAst(enabled()));
  for (const html of [renderToStaticMarkup(<TemplateReadOnlyPreview preview={preview} />), renderToStaticMarkup(<ConversationWrapperReviewPreview preview={preview} languageTag="fr" />)]) {
    assert.match(html, /Optional product image illustration/);
    assert.ok(html.indexOf('<svg') < html.indexOf('Example AI or merchant response'));
    assert.doesNotMatch(html, /<img|src=|https:\/\//);
  }
  assert.doesNotMatch(renderToStaticMarkup(<TemplateReadOnlyPreview preview={makeExamplePreview(compileTemplateAst(newWrapperDraft("AI")))} />), /Optional product image illustration/);
});

test("before/after activation preview makes image addition visible without tenant data or live images", () => {
  const row = wrapperRow({ audience: "AI", ast: enabled() }); const eligible = checkWrapperEligibility(row, "AI");
  if (!eligible.eligible) throw new Error(eligible.reason);
  const proposed = { id: row.id, audience: "AI" as const, sourceHash: row.sourceHash, publishedAt: null, projections: eligible.projections };
  const html = renderToStaticMarkup(<WrapperBeforeAfterPreview current={null} proposed={proposed} audience="AI" languageTag="en" checkoutAvailable={false} />);
  assert.equal((html.match(/aria-label="Optional product image illustration"/g) ?? []).length, 1);
  assert.ok(html.indexOf('<svg') < html.indexOf('Example AI reply'));
  assert.match(html, /Fictional example only/); assert.doesNotMatch(html, /<img|src=/);
});
