import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { newMetaDraft, newWrapperDraft } from "../../src/lib/admin/whatsapp-templates/authoring/draft-operations.ts";
import { TemplateFamilyPurposeSelector } from "../../src/components/admin/whatsapp-templates/authoring/template-family-purpose-selector.tsx";
import { TemplateContentEditor } from "../../src/components/admin/whatsapp-templates/authoring/template-content-editor.tsx";
import { TemplateReadOnlyPreview } from "../../src/components/admin/whatsapp-templates/authoring/template-read-only-preview.tsx";
import { TemplateSaveControls } from "../../src/components/admin/whatsapp-templates/authoring/template-save-controls.tsx";
import { TemplateCatalogue } from "../../src/components/admin/whatsapp-templates/authoring/template-catalogue.tsx";
import { TemplateEditorSteps } from "../../src/components/admin/whatsapp-templates/authoring/template-editor-steps.tsx";
import { TemplateReviewSummary } from "../../src/components/admin/whatsapp-templates/authoring/template-review-summary.tsx";

test("composed Meta editor exposes section fields, offer chooser, and English source; mobile stacks fields", () => {
  const draft = newMetaDraft();
  const html = renderToStaticMarkup(<>
    <TemplateFamilyPurposeSelector draft={draft} onChange={() => {}} onFamilyChange={() => {}} />
    <TemplateContentEditor draft={draft} onChange={() => {}} />
  </>);
  for (const label of ["Template family", "Recovery stage", "Offer variant", "Source language", "Header", "Body", "Footer", "Meta buttons"]) assert.match(html, new RegExp(label));
  assert.match(html, /grid-cols-1/);
  assert.match(html, /sm:grid-cols-2/);
  assert.match(html, /response.body|No header content|Header text/i);
});
test("alternative-product editor exposes a second indexed CTA with the product URL binding", () => {
  const draft = newMetaDraft("INITIAL", "AUTOMATIC_OFFER");
  draft.promotionTarget = "ALTERNATIVE_PRODUCT";
  draft.buttons = [{ type: "url", label: "Resume checkout", urlPrefix: "https://shop.example/redirect?checkout=", variable: "checkout.url" }];
  const html = renderToStaticMarkup(<TemplateContentEditor draft={draft} onChange={() => {}} />);
  assert.match(html, /Add link button/);
  assert.match(html, /promotion\.productUrl/);
  assert.match(html, /Button 1 dynamic URL binding/);
});
test("wrapper structure presents required slot, checkout conditional and audience selection", () => {
  const draft = newWrapperDraft();
  const html = renderToStaticMarkup(<>
    <TemplateFamilyPurposeSelector draft={draft} onChange={() => {}} onFamilyChange={() => {}} />
    <TemplateContentEditor draft={draft} onChange={() => {}} />
  </>);
  assert.match(html, /Wrapper audience/);
  assert.match(html, /Response: response.body \(required\)/);
  assert.match(html, /checkout context is available/);
});
test("preview is presentation-only; save controls describe immutability, validation and disabled submits", () => {
  const preview = renderToStaticMarkup(<TemplateReadOnlyPreview preview={{ family: "META_RECOVERY", header: "Title", body: "Example content", footer: "End", buttons: [] }} />);
  assert.match(preview, /Illustrative values only/); assert.match(preview, /Example content/);
  const save = renderToStaticMarkup(<TemplateSaveControls issues={[{ path: "body", message: "Body required" }]} saving={false} savedId={null} error="" onSave={() => {}} />);
  assert.match(save, /disabled/); assert.match(save, /role="alert"/); assert.match(save, /Clone as New/);
});
test("catalogue empty/search and pagination provide accessible navigation", () => {
  const empty = renderToStaticMarkup(<TemplateCatalogue items={[]} search="" page={1} hasNext={false} />);
  assert.match(empty, /No templates found/); assert.match(empty, /role="search"/);
  const listed = renderToStaticMarkup(<TemplateCatalogue items={[{ id: "wtdef_fixture", kind: "META_RECOVERY", purpose: "INITIAL", offerType: "NO_OFFER", audience: null, sourceLanguageTag: "en", status: "SAVED", providerTemplateName: "moda_example", createdAt: new Date().toISOString() }]} search="offer" page={2} hasNext={true} selectedId="wtdef_fixture" />);
  assert.match(listed, /aria-current="page"/); assert.match(listed, /Previous/); assert.match(listed, /Next/);
});


test("editor tabs expose accessible navigation and review validation count", () => {
  const html = renderToStaticMarkup(<TemplateEditorSteps value="compose" onChange={() => {}} issueCount={2} />);
  assert.match(html, /role="tablist"/);
  assert.match(html, /role="tab"/);
  assert.match(html, /aria-selected="true"/);
  assert.match(html, /Review &amp; Save/);
  assert.match(html, /2 validation issues/);
});

test("review summary shows relevant edit links and every outstanding validation issue", () => {
  const html = renderToStaticMarkup(<TemplateReviewSummary draft={newMetaDraft()} issues={[{ path: "buttons.0", message: "URL requires a valid HTTPS prefix." }]} onStep={() => {}} />);
  assert.match(html, /English source summary/);
  assert.match(html, /Edit setup/);
  assert.match(html, /Edit content/);
  assert.match(html, /URL requires a valid HTTPS prefix/);
});

test("compose editor displays semantic variables beside the message and field-local validation", () => {
  const html = renderToStaticMarkup(<TemplateContentEditor draft={newMetaDraft()} onChange={() => {}}
    issues={[{ path: "body.0", message: "Invalid body content" }]} />);
  assert.match(html, /Insert variable:/);
  assert.match(html, /Customer&#x27;s first name/);
  assert.match(html, /Invalid body content/);
  assert.match(html, /aria-invalid="true"/);
});

test("ShopBrand insertion is grouped alongside each supported section, not offered in static Meta footer", () => {
  const draft = newMetaDraft();
  const meta = renderToStaticMarkup(<TemplateContentEditor draft={draft} onChange={() => {}} />);
  assert.match(meta, /ShopBrand fields \(3\)/); // one supported text header variable
  assert.match(meta, /ShopBrand fields \(8\)/); // every field available in body
  assert.match(meta, /Meta footers must be static/);
  assert.match(meta, /Brand name/);
  assert.match(meta, /Logo URL \(text\)/);
  const wrapper = renderToStaticMarkup(<TemplateContentEditor draft={newWrapperDraft()} onChange={() => {}} />);
  assert.equal((wrapper.match(/ShopBrand fields \(8\)/g) ?? []).length, 3); // header/body/footer
  assert.match(wrapper, /Square logo alt text/);
});
