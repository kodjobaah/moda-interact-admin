import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const components = "src/components/admin/whatsapp-templates";
const lib = "src/lib/admin/whatsapp-templates";

test("reviewed layout choices identify dates and active revision, and clones preselect without mutating source", () => {
  const selector = read(`${components}/authoring/common-layout-selector.tsx`);
  assert.match(selector, /ref.createdAt/); assert.match(selector, /ref.active/);
  assert.match(selector, /applyCommonLayoutChoice/);
  assert.match(read(`${components}/authoring/template-authoring-workspace.tsx`), /commonLayouts.find\(layout => layout.active\)/);
  assert.match(read(`${components}/authoring/use-template-authoring-draft.ts`), /cloneDraft\(source.english.authoring\)[\s\S]*applyCommonLayoutChoice\(initial, activeLayout\)/);
});

test("publication diagnostics identify selected source and expose a direct clone path", () => {
  const gate = read(`${lib}/common-activation/gates.ts`);
  assert.ok(gate.indexOf("const mismatch =") < gate.indexOf("ref = requireCommonLayout(raw)"));
  for (const field of ["definitionId", "providerTemplateName", "referencedCommonDefinitionId", "activeCommonDefinitionId", "languageTag"]) assert.match(gate, new RegExp(field));
  const action = read("src/app/actions/whatsapp-template-publication.ts");
  assert.match(action, /\.\.\.error.context/); assert.match(action, /cause: error.cause/);
  assert.match(action, /resultError\(error, "review", input\?\.definitionId\)/);
  assert.match(read(`${components}/publishing/template-publication-workspace.tsx`), /Clone using active common layout/);
  assert.match(read(`${lib}/publishing/assignment.ts`), /logger.error\("admin.whatsapp_publication.shop_failed",[\s\S]*failureCode: code,[\s\S]*error/);
});

test("catalogue labels references as advisory and review links to real translation requests", () => {
  const catalogue = read(`${components}/authoring/template-catalogue.tsx`);
  assert.match(catalogue, /Layout references are advisory/); assert.match(catalogue, /Active layout · 20\/20 linked/);
  assert.match(read(`${components}/compilation/translation-review-workspace.tsx`), /\/translations`\}[\s\S]*Start translations/);
});

test("coordinated review and transaction cover all configured defaults, not just merchant assignments", () => {
  const panel = read(`${components}/common-activation/panel.tsx`);
  assert.match(panel, /Configured platform defaults/); assert.match(panel, /defaultReplacements/);
  assert.match(panel, /options.defaults.some\(slot=>!chosenDefaults\[slot.id\]\)/);
  assert.match(read(`${lib}/common-activation/preview.ts`), /await previewDefaultReplacements/);
  const service = read(`${lib}/common-activation/service.ts`);
  assert.match(service, /WhatsAppRecoveryTemplateDefault" ORDER BY "id" LIMIT 13 FOR UPDATE/);
  assert.ok(service.indexOf("await persistDefaultReplacements") < service.indexOf("const activated=await activateConversationWrapperInTransaction"));
  assert.match(service, /TransactionIsolationLevel.Serializable/);
});
