import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TemplateCompositeProfileEditor } from "../../src/components/admin/whatsapp-templates/authoring/template-composite-profile-editor";
import { TemplateReadOnlyPreview } from "../../src/components/admin/whatsapp-templates/authoring/template-read-only-preview";
import { TemplateCompositeProfilePreview } from "../../src/components/admin/whatsapp-templates/authoring/template-composite-profile-preview";
import { makeExamplePreview } from "../../src/lib/admin/whatsapp-templates/authoring/preview";
import { compileTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/compiler";
import { layoutAst } from "../fixtures/arch075-common-layout";
import { leftCompositeProfile as left, topCompositeProfile as top } from "../fixtures/arch075-composite-profile";
import { createComponentHarness, loadPolicyModule, findElement } from "./helpers/commerce-model-policy-module-harness.mjs";
import { COMPOSITE_PROFILE_DEFAULTS, COMPOSITE_PROFILE_FIELDS } from "../../src/lib/admin/whatsapp-templates/authoring/composite-profile";
import type { WrapperTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/types";

test("only common source drafts can explicitly add geometry; saved preview shows geometry and authored caption", () => {
  const historicalClone = layoutAst(); delete historicalClone.compositeProfile;
  const legacy = renderToStaticMarkup(<TemplateCompositeProfileEditor draft={historicalClone} onChange={() => {}} issues={[]} />);
  assert.match(legacy, /saved template is the layout source of truth/);
  assert.match(legacy, /Clone as New/); assert.doesNotMatch(legacy, /type="number"/);
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

test("draft opt-in/removal and numeric editing preserve current text without saving or mutating source", () => {
  const h = createComponentHarness(); const changes: WrapperTemplateAst[] = [];
  const module = loadPolicyModule("src/components/admin/whatsapp-templates/authoring/template-composite-profile-editor.tsx", {
    "react/jsx-runtime": h.jsxRuntime,
    "@/lib/admin/whatsapp-templates/authoring/composite-profile": { COMPOSITE_PROFILE_DEFAULTS, COMPOSITE_PROFILE_FIELDS },
    "@/components/admin/platform-configuration/configuration-field": { ConfigurationField(props: { field: { name: string }; onChange: (value: unknown) => void }) { return h.jsxRuntime.jsx("input", { name: props.field.name, onChange: props.onChange }); } },
  }, { workspaceRoot: process.cwd() }) as { TemplateCompositeProfileEditor(props: Record<string, unknown>): unknown };
  const original = layoutAst(); delete original.compositeProfile; const before = structuredClone(original);
  let tree = h.render(module.TemplateCompositeProfileEditor, { draft: original, onChange: (d: WrapperTemplateAst) => changes.push(d), issues: [] });
  const checkbox = findElement(tree, (e: { props: { type?: string } }) => e.props.type === "checkbox");
  checkbox.props.onChange({ target: { checked: true } });
  assert.deepEqual(changes[0].compositeProfile, left); assert.deepEqual(original, before);
  tree = h.render(module.TemplateCompositeProfileEditor, { draft: changes[0], onChange: (d: WrapperTemplateAst) => changes.push(d), issues: [] });
  findElement(tree, (e: { props: { name?: string } }) => e.props.name === "fontSize").props.onChange(36);
  assert.equal(changes[1].compositeProfile?.fontSize, 36); assert.deepEqual(changes[1].header, before.header);
  findElement(tree, (e: { props: { type?: string } }) => e.props.type === "checkbox").props.onChange({ target: { checked: false } });
  assert.equal("compositeProfile" in changes[2], false);
});
