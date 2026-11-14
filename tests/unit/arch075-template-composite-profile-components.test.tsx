import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TemplateCompositeProfileEditor } from "../../src/components/admin/whatsapp-templates/authoring/template-composite-profile-editor";
import { TemplateReadOnlyPreview } from "../../src/components/admin/whatsapp-templates/authoring/template-read-only-preview";
import { TemplateCompositeProfilePreview } from "../../src/components/admin/whatsapp-templates/authoring/template-composite-profile-preview";
import { makeExamplePreview } from "../../src/lib/admin/whatsapp-templates/authoring/preview";
import { makeImmutableAuthoringRecord, compileTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/compiler";
import { cloneDraft } from "../../src/lib/admin/whatsapp-templates/authoring/draft-operations";
import { templateHash } from "../../src/lib/admin/whatsapp-templates/authoring/identifiers";
import { verifyFrozenTemplateProjection } from "../../src/lib/admin/whatsapp-templates/authoring/frozen-projection";
import { compositeProfileError } from "../../src/lib/admin/whatsapp-templates/authoring/composite-profile";
import { layoutAst } from "../fixtures/arch075-common-layout";
import { leftCompositeProfile as left, topCompositeProfile as top } from "../fixtures/arch075-composite-profile";
import { createComponentHarness, loadPolicyModule, findElement } from "./helpers/commerce-model-policy-module-harness.mjs";
import { COMPOSITE_PROFILE_DEFAULTS, COMPOSITE_PROFILE_FIELDS } from "../../src/lib/admin/whatsapp-templates/authoring/composite-profile";
import type { WrapperTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/types";

test("only common source drafts can explicitly add geometry; saved preview shows geometry and authored caption", () => {
  const historicalClone = layoutAst(); delete historicalClone.compositeProfile;
  const legacy = renderToStaticMarkup(<TemplateCompositeProfileEditor draft={historicalClone} onChange={() => {}} issues={[]} />);
  assert.match(legacy, /saved template is the layout source of truth/);
  assert.match(legacy, /Clone as New/); assert.match(legacy, /Add required composite layout/); assert.doesNotMatch(legacy, /type="number"/);
  assert.equal(renderToStaticMarkup(<TemplateCompositeProfileEditor draft={{ ...layoutAst(), audience: "AI" }} onChange={() => {}} issues={[]} />), "");
  for (const profile of [left, top]) {
    const draft = { ...layoutAst(), compositeProfile: profile };
    const html = renderToStaticMarkup(<TemplateCompositeProfileEditor draft={draft} onChange={() => {}} issues={[]} />);
    assert.match(html, /config-logoLeft/); assert.match(html, /config-textLineSpacingPt/); assert.doesNotMatch(html, /config-schemaVersion/);
    const preview = makeExamplePreview(compileTemplateAst(draft));
    const rendered = renderToStaticMarkup(<TemplateReadOnlyPreview preview={preview} />);
    assert.match(rendered, /Schematic geometry only/);
    assert.match(rendered, new RegExp(`viewBox="0 0 ${profile.canvasWidth} ${profile.withProductHeight}"`));
    assert.match(rendered, /Custom shop divider/);
    assert.match(rendered, /Continue when ready/);
    assert.match(rendered, /Actual caption position/);
    assert.match(rendered, /Native Meta templates are unchanged/);
    assert.doesNotMatch(rendered, /WhatsApp-style preview|config-logoLeft/);
  }
});

test("invalid geometry is shown as invalid instead of a plausible composed image", () => {
  const html = renderToStaticMarkup(<TemplateCompositeProfilePreview values={{ ...left, logoLeft: 264 }} />);
  assert.match(html, /must not overlap/); assert.doesNotMatch(html, /<svg/);
});

test("explicit historical profile and both media-size edits preserve authored content through immutable save/read/clone", () => {
  const h = createComponentHarness(); const changes: WrapperTemplateAst[] = [];
  const module = loadPolicyModule("src/components/admin/whatsapp-templates/authoring/template-composite-profile-editor.tsx", {
    "react/jsx-runtime": h.jsxRuntime,
    "@/lib/admin/whatsapp-templates/authoring/composite-profile": { COMPOSITE_PROFILE_DEFAULTS, COMPOSITE_PROFILE_FIELDS },
    "@/components/admin/platform-configuration/configuration-field": { ConfigurationField(props: { field: { name: string }; onChange: (value: unknown) => void }) { return h.jsxRuntime.jsx("input", { name: props.field.name, onChange: props.onChange }); } },
  }, { workspaceRoot: process.cwd() }) as { TemplateCompositeProfileEditor(props: Record<string, unknown>): unknown };
  const original = layoutAst(); delete original.compositeProfile; const before = structuredClone(original);
  const render = (draft: WrapperTemplateAst) => h.render(module.TemplateCompositeProfileEditor, { draft, onChange: (d: WrapperTemplateAst) => changes.push(d), issues: [] });
  let tree = render(original);
  findElement(tree, (e: { type: string }) => e.type === "button").props.onClick();
  assert.deepEqual(changes[0].compositeProfile, left); assert.deepEqual(original, before);
  const baseline = makeImmutableAuthoringRecord(changes[0]);
  for (const [name, value] of [["logoWidth", 140], ["logoHeight", 120], ["productWidth", 1000], ["productHeight", 500]] as const) {
    tree = render(changes.at(-1)!);
    findElement(tree, (e: { props: { name?: string } }) => e.props.name === name).props.onChange(value);
    assert.equal(changes.at(-1)!.compositeProfile![name], value);
  }
  const edited = changes.at(-1)!;
  const { compositeProfile: ignored, ...content } = edited; void ignored;
  assert.deepEqual(content, before); assert.deepEqual(original, before);
  assert.equal("productImage" in edited, false);
  assert.equal(compositeProfileError(edited.compositeProfile), null);
  const record = makeImmutableAuthoringRecord(edited);
  if (record.prepared.family !== "MODA_CONVERSATION_WRAPPER") throw Error("Wrong family");
  assert.deepEqual(record.prepared.compositeProfile, edited.compositeProfile);
  assert.notEqual(templateHash(record.authoring), templateHash(baseline.authoring));
  assert.notEqual(templateHash(record.prepared), templateHash(baseline.prepared));
  assert.deepEqual(verifyFrozenTemplateProjection(JSON.parse(JSON.stringify(record)), templateHash(record.prepared)), record.prepared);
  assert.deepEqual(cloneDraft(record.authoring), edited);
  const html = renderToStaticMarkup(<TemplateCompositeProfileEditor draft={edited} onChange={() => {}} issues={[]} />);
  assert.match(html, /Logo size/); assert.match(html, /Product image size/);
  assert.match(html, /fixed binding/); assert.match(html, /fixed optional binding/);
  assert.match(html, /<code>LOGO<\/code>/); assert.match(html, /<code>response.productImage<\/code> · BEFORE_BODY/);
  assert.match(html, /When no product is selected, delivery uses a header-only image/);
  assert.match(html, /If selected product media cannot be verified, delivery uses the complete text reply/);
  assert.match(html, /render-slot pixels/); assert.match(html, /without cropping/); assert.match(html, /WhatsApp scales/);
  assert.doesNotMatch(html, /type="checkbox"|type="url"/);
});

test("preview uses edited logo/product dimensions and explicit no-product header-only geometry", () => {
  const h = createComponentHarness();
  const module = loadPolicyModule("src/components/admin/whatsapp-templates/authoring/template-composite-profile-preview.tsx", {
    react: h.react, "react/jsx-runtime": h.jsxRuntime,
    "@modainteract/moda-interact-shared/commerce/presentation": { RecoveryCompositeProfileSchema: { safeParse: (data: unknown) => ({ success: true, data }) } },
    "@/lib/admin/whatsapp-templates/authoring/composite-profile": { compositeProfileError },
  }, { workspaceRoot: process.cwd() }) as { TemplateCompositeProfilePreview(props: Record<string, unknown>): unknown };
  const values = { ...left, logoWidth: 140, logoHeight: 120, productWidth: 1000, productHeight: 500 };
  const props = { values, headerText: "Shop details", caption: "Answer\nCheckout link" };
  let tree = h.render(module.TemplateCompositeProfilePreview, props);
  assert.equal(findElement(tree, (e: { props: { fill?: string } }) => e.props.fill === "#dbeafe").props.width, 140);
  assert.equal(findElement(tree, (e: { props: { fill?: string } }) => e.props.fill === "#f3f4f6").props.height, 500);
  findElement(tree, (e: { props: { type?: string } }) => e.props.type === "checkbox").props.onChange({ target: { checked: false } });
  tree = h.render(module.TemplateCompositeProfilePreview, props);
  assert.equal(findElement(tree, (e: { type: string }) => e.type === "svg").props.viewBox, `0 0 ${left.canvasWidth} ${left.headerOnlyHeight}`);
  assert.equal(findElement(tree, (e: { props: { fill?: string } }) => e.props.fill === "#f3f4f6"), undefined);
  assert.equal(findElement(tree, (e: { type: string; props: { children?: string } }) => e.type === "pre" && e.props.children === props.caption).props.children, props.caption);
});
