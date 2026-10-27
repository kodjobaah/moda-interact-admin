import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { compileTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/compiler.ts";
import { templateHash } from "../../src/lib/admin/whatsapp-templates/authoring/identifiers.ts";
import { imageHeaderRegistrationBindings } from "../../src/lib/admin/whatsapp-templates/meta/snapshot.ts";
import { sourceLocations } from "../../src/lib/admin/whatsapp-templates/compilation/locations.ts";
import type { MetaTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/types.ts";

const fixture = JSON.parse(readFileSync("tests/fixtures/arch049-admin-media-header-projection.json", "utf8"));

test("immutable Admin JSON fixture is the explicit role-aware BG004 handoff vector", () => {
  const ast = fixture.ast as MetaTemplateAst;
  const prepared = compileTemplateAst(ast);
  assert.equal(prepared.family, "META_RECOVERY");
  if (prepared.family !== "META_RECOVERY") {
    throw new Error("Expected a compiled Meta template");
  }
  assert.deepEqual(prepared.components, fixture.componentsSnapshot);
  assert.deepEqual(imageHeaderRegistrationBindings(prepared), fixture.parameterBindingsSnapshot);
  assert.equal(templateHash({ ...prepared, parameterBindings: fixture.parameterBindingsSnapshot }), fixture.submittedContentHash);
  assert.equal(templateHash(prepared), "cea834dda354d2b4d83d32e1c7a685796a88c5cdb74af24e1077fe5b7246ffd2");
  assert.deepEqual(Object.keys(fixture.parameterBindingsSnapshot).sort(),
    ["schemaVersion", "headerMediaRole", "header", "body", "buttons"].sort());
  assert.equal(JSON.stringify(fixture).includes("header_handle"), false);
  assert.equal(JSON.stringify(fixture).includes("merchant.example"), false);
});

test("IMAGE role identity survives translation source extraction without a translator-defined header", () => {
  const keys = sourceLocations(fixture.ast as MetaTemplateAst).map((segment) => segment.key);
  assert.deepEqual(keys, ["body"]);
  assert.equal(fixture.ast.shopBrandMediaRole, "LOGO");
  assert.notEqual(templateHash({ schemaVersion: 1, family: "META_RECOVERY", category: "MARKETING",
    components: fixture.componentsSnapshot,
    parameterBindings: { ...fixture.parameterBindingsSnapshot, headerMediaRole: "SQUARE_LOGO" } }), fixture.submittedContentHash);
});
