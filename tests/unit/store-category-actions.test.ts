import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actionSource = await readFile(
  new URL("../../src/app/actions/store-categories.ts", import.meta.url),
  "utf8",
);
const catalogueSource = await readFile(
  new URL("../../src/lib/admin/store-categories.ts", import.meta.url),
  "utf8",
);

test("every catalogue mutation enters through authenticated SUPER_ADMIN authorization", () => {
  const authIndex = actionSource.indexOf("await requirePlatformAdminMutation()");
  const roleIndex = actionSource.indexOf('principal.role !== "SUPER_ADMIN"');
  const parseIndex = actionSource.indexOf("mutationFromForm(formData)");
  const transactionIndex = actionSource.indexOf("prisma.$transaction(");
  assert.ok(authIndex >= 0);
  assert.ok(roleIndex > authIndex);
  assert.ok(parseIndex > roleIndex);
  assert.ok(transactionIndex > parseIndex);
  assert.match(actionSource, /ensureDevelopmentPlatformAdmin\(transaction, principal\)/);
  assert.match(actionSource, /isolationLevel: "Serializable"/);
  assert.match(actionSource, /if \(databaseCode\(error\) === "P2002"\)/);
  assert.match(actionSource, /A category with this slug already exists/);
});

test("category and template update contracts do not accept identity changes", () => {
  assert.match(
    actionSource,
    /case "update-category":\s*return \{ kind: intent, input: parseUpdateStoreCategoryForm\(formData\) \}/,
  );
  assert.match(
    actionSource,
    /case "update-template":\s*return \{ kind: intent, input: parseUpdatePromptTemplateForm\(formData\) \}/,
  );
  assert.match(catalogueSource, /slug: input\.slug/);
  assert.doesNotMatch(
    catalogueSource.slice(
      catalogueSource.indexOf('if (mutation.kind === "update-category")'),
      catalogueSource.indexOf('if (mutation.kind === "create-template")'),
    ),
    /slug\s*:/,
  );
});

test("catalogue reads are deterministically ordered and select profile counts only", () => {
  assert.match(
    catalogueSource,
    /orderBy:\s*\[\s*\{ displayOrder: "asc" \},\s*\{ displayName: "asc" \},\s*\{ id: "asc" \}/,
  );
  assert.match(catalogueSource, /templates:\s*\{\s*orderBy: \[\{ displayName: "asc" \}, \{ id: "asc" \}\]/);
  assert.match(catalogueSource, /shopifyTaxonomyCategoryId: "asc"/);
  assert.match(catalogueSource, /activeShopProfiles: true/);
  assert.match(catalogueSource, /pendingShopProfiles: true/);
  assert.doesNotMatch(catalogueSource, /prisma\.shop\.findMany|shop:\s*\{\s*include/);
  assert.match(
    catalogueSource,
    /shopifyTaxonomyCategoryId: mapping\.shopifyTaxonomyCategoryId,[\s\S]*?weight: mapping\.weight,[\s\S]*?category:\s*\{\s*displayOrder: category\.displayOrder,[\s\S]*?id: category\.id/,
  );
});

test("atomic category authoring uses the same authenticated serializable mutation boundary", () => {
  assert.match(actionSource, /export async function createStoreCategoryBundleAction/);
  assert.match(actionSource, /parseCreateStoreCategoryBundleInput\(payload\)/);
  assert.match(actionSource, /return createStoreCategoryBundle\(transaction, input, principal\.id\)/);
  assert.match(actionSource, /ensureDevelopmentPlatformAdmin\(transaction, principal\)/);
  assert.match(actionSource, /isolationLevel: "Serializable"/);
});
