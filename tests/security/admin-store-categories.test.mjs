import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

async function source(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

test("Store Categories route is protected and mutations independently require SUPER_ADMIN", async () => {
  const page = await source("src/app/(protected)/system-controls/store-categories/page.tsx");
  const action = await source("src/app/actions/store-categories.ts");
  assert.match(page, /await requirePlatformAdminPage\(\)/);
  assert.match(action, /await requirePlatformAdminMutation\(\)/);
  assert.match(action, /principal\.role !== "SUPER_ADMIN"/);
  assert.match(action, /ensureDevelopmentPlatformAdmin\(transaction, principal\)/);
});

test("category updates cannot carry slug and the database identity guard is not replaced", async () => {
  const validation = await source("src/lib/admin/store-category-validation.ts");
  const service = await source("src/lib/admin/store-categories.ts");
  assert.match(validation, /if \(formData\.has\("slug"\)\)/);
  assert.match(validation, /Category slug is immutable after creation/);
  const updateBlock = service.slice(
    service.indexOf('if (mutation.kind === "update-category")'),
    service.indexOf('if (mutation.kind === "create-template")'),
  );
  assert.doesNotMatch(updateBlock, /slug\s*:/);
  assert.doesNotMatch(updateBlock, /\$executeRaw|\$queryRaw/);
});

test("Admin catalogue introduces no translation persistence or queue surface", async () => {
  const files = [
    "src/app/actions/store-categories.ts",
    "src/lib/admin/store-categories.ts",
    "src/lib/admin/store-category-validation.ts",
    "src/components/admin/store-categories/store-category-catalog.tsx",
    "src/components/admin/store-categories/store-category-editor.tsx",
    "src/components/admin/store-categories/prompt-template-editor.tsx",
    "src/components/admin/store-categories/taxonomy-mapping-editor.tsx",
  ];
  const contents = (await Promise.all(files.map(source))).join("\n");
  assert.doesNotMatch(contents, /CommercePromptTemplateTranslation|TranslationJob|Queue\.add|queue\.add/i);
  assert.match(contents, /Shopify localization keys must exist before merchants can select this category/);
});