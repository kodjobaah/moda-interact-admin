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

const [page, action, service, validation, table, editor, mutationForm] =
  await Promise.all([
    source("src/app/(protected)/commerce-models/catalogue/page.tsx"),
    source("src/app/actions/model-catalogue.ts"),
    source("src/lib/admin/model-catalogue.ts"),
    source("src/lib/admin/model-catalogue-validation.ts"),
    source("src/components/admin/model-catalogue/model-catalogue-table.tsx"),
    source("src/components/admin/model-catalogue/model-catalogue-editor.tsx"),
    source(
      "src/components/admin/model-catalogue/model-catalogue-mutation-form.tsx",
    ),
  ]);

test("page, read service and every mutation enforce their own authorization", () => {
  const pageHandler = page.slice(page.indexOf("export default async function"));
  assert.match(page, /await requirePlatformAdminPage\(\)/);
  assert.ok(
    pageHandler.indexOf("await requirePlatformAdminPage()") <
      pageHandler.indexOf("getModelCatalogueAdminPage"),
  );
  assert.match(service, /await requirePlatformAdminRead\(\)/);
  assert.match(
    action,
    /const principal = await requirePlatformAdminMutation\(\)/,
  );
  assert.match(action, /if \(principal\.role !== "SUPER_ADMIN"\)/);
  assert.match(
    action,
    /if \(principal\.role !== "SUPER_ADMIN"\) \{\s*throw new Error\("SUPER_ADMIN access is required\."\);\s*\}/,
  );
  assert.ok(
    action.indexOf('throw new Error("SUPER_ADMIN access is required.")') <
      action.indexOf("mutationFromForm(formData)"),
  );
  assert.match(
    action,
    /await ensureDevelopmentPlatformAdmin\(transaction, principal\)/,
  );
  assert.match(action, /publicMutationErrors\.has\(cause\.message\)/);
  assert.match(action, /if \(message\) return \{ ok: false, message \}/);
  assert.match(action, /throw cause/);
  assert.ok(
    action.indexOf("ensureDevelopmentPlatformAdmin(transaction, principal)") <
      action.indexOf("mutateModelCatalogue(transaction"),
  );
  assert.ok(
    action.indexOf('parseModelCatalogueForm(formData, { mode: "create" })') <
      action.indexOf("await prisma.$transaction"),
  );
});

test("read service applies validated filters and exact server-side page bounds", () => {
  assert.match(service, /const pageSize = 50 as const/);
  assert.match(service, /take: pageSize/);
  assert.match(service, /skip: \(currentPage - 1\) \* pageSize/);
  assert.match(service, /commerceModelCatalogueEntry\.count\(\{ where \}\)/);
  assert.match(service, /availabilityId: input\.availabilityId/);
  assert.match(service, /mode: "insensitive"/);
  assert.match(service, /displayName: \{ contains: query/);
  assert.match(service, /provider: \{ contains: query/);
  assert.match(service, /providerModelId: \{ contains: query/);
  assert.match(service, /input\.availabilityId !== undefined/);
  assert.match(service, /Model Availability not found\./);
  assert.match(service, /_count: \{ select: \{ configurations: true \} \}/);
  assert.match(service, /selectionCount: record\._count\.configurations/);
  assert.doesNotMatch(service, /configurations:\s*\{\s*select:/);
  const databaseOrdering = service.slice(
    service.indexOf("orderBy:", service.indexOf("take: pageSize")),
    service.indexOf("select:", service.indexOf("take: pageSize")),
  );
  assert.match(databaseOrdering, /availability: \{ scope: "asc" \}/);
  assert.match(
    databaseOrdering,
    /availability: \{ shop: \{ domain: "asc" \} \}/,
  );
  assert.match(databaseOrdering, /\{ displayName: "asc" \}/);
  assert.doesNotMatch(databaseOrdering, /availabilityId/);
});

test("availability options and catalogue rows are validated with canonical Shared schemas", () => {
  assert.match(service, /CommerceModelAvailabilitySchema\.parse/);
  assert.match(service, /CommerceModelCatalogueEntrySchema\.parse/);
  assert.match(service, /"Platform"/);
  assert.match(service, /`Shop · \$\{shopDomain\}`/);
  assert.match(service, /· Disabled/);
  assert.match(service, /\.sort\(compareAvailabilityOptions\)/);
  assert.match(service, /rows\.sort\(/);
});

test("development principal is materialized in the mutation transaction before writes", () => {
  const transactionBody = action.slice(
    action.indexOf("await prisma.$transaction"),
  );
  assert.ok(
    transactionBody.indexOf(
      "ensureDevelopmentPlatformAdmin(transaction, principal)",
    ) < transactionBody.indexOf("mutateModelCatalogue(transaction"),
  );
  assert.match(action, /isolationLevel: "Serializable"/);
  assert.match(action, /revalidatePath\("\/commerce-models\/catalogue"\)/);
  assert.match(action, /revalidatePath\("\/commerce-models\/availability"\)/);
});

test("create, update and lifecycle writes preserve immutable identity and use CAS", () => {
  assert.match(action, /case "create"/);
  assert.match(action, /case "update"/);
  assert.match(action, /case "set-enabled"/);
  assert.match(service, /data: createData\(input, actorAdminId\)/);
  assert.match(service, /createdByAdminId: actorAdminId/);
  assert.match(service, /updatedByAdminId: actorAdminId/);
  assert.match(
    service,
    /where: \{ id: existing\.id, editVersion: mutation\.expectedEditVersion \}/,
  );
  assert.match(
    service,
    /availabilityId: input\.availabilityId,[\s\S]*?editVersion: mutation\.expectedEditVersion \+ 1/,
  );
  assert.doesNotMatch(
    service.slice(
      service.indexOf("async function updateCatalogueEntry"),
      service.indexOf("async function setCatalogueEntryEnabled"),
    ),
    /provider:\s*input|providerModelId:\s*input/,
  );
  assert.match(validation, /mode === "create" \? createFields : updateFields/);
  assert.doesNotMatch(
    validation.slice(
      validation.indexOf("const updateFields"),
      validation.indexOf("function field"),
    ),
    /"provider"|"providerModelId"/,
  );
  assert.doesNotMatch(service, /\.delete\(/);
  assert.doesNotMatch(service, /commerceAgentConfiguration/);
});

test("audit writes use both target columns and keep configuration out of metadata", () => {
  assert.match(service, /actorAdminId,/);
  assert.match(service, /modelCatalogueEntryId: model\.id/);
  assert.match(service, /modelAvailabilityId: model\.availabilityId/);
  assert.match(service, /ASSIGN_MODEL_CATALOGUE_ENTRY_AVAILABILITY/);
  assert.match(service, /previousAvailabilityId: existing\.availabilityId/);
  assert.match(service, /newAvailabilityId: input\.availabilityId/);
  assert.doesNotMatch(service, /metadata:\s*\{[^}]*\bconfiguration\s*:/s);
  assert.doesNotMatch(
    `${action}\n${editor}`,
    /name="[^"]*(?:apiKey|credential|Authorization|baseUrl)/i,
  );
});

test("Platform Admin reads are read-only and SUPER_ADMIN receives mutation controls", () => {
  assert.match(page, /canMutate=\{principal\.role === "SUPER_ADMIN"\}/);
  assert.match(table, /\{canMutate \? \([\s\S]*?Create model/);
  assert.match(table, /canMutate \? "edit" : "view"/);
  assert.match(table, /drawer === "edit" && canMutate/);
  assert.match(table, /drawer === "view" && !canMutate/);
  assert.match(editor, /canEdit \? \(/);
  assert.match(editor, /mode === "view"/);
  assert.match(editor, /intent" value="set-enabled"/);
});

test("table derives OpenRouter identity, shows configuration state only and preserves exact filter copy", () => {
  const normalizedTable = table.replace(/\s+/g, " ");
  assert.match(normalizedTable, /createOpenRouterModelId\(\{/);
  assert.match(normalizedTable, /provider: row\.model\.provider/);
  assert.match(normalizedTable, /providerModelId: row\.model\.providerModelId/);
  assert.match(table, /function configurationLabel/);
  assert.match(table, /"Default"\s*:\s*"Configured"/);
  assert.doesNotMatch(table, /JSON\.stringify\(row\.model\.configuration/);
  for (const label of [
    "Model",
    "OpenRouter model ID",
    "Availability",
    "Status",
    "Configuration",
    "Selections",
    "Actions",
  ]) {
    assert.match(table, new RegExp(`>${label}</th>`));
  }
  assert.match(table, /Search model name, provider or model ID/);
  assert.match(table, /No model catalogue entries match the current filters\./);
});

test("editor keeps identity read-only, configuration direct and selected-model warning informational", () => {
  assert.match(editor, /readOnlyField\("Provider", row\.model\.provider\)/);
  assert.match(
    editor,
    /readOnlyField\("Provider model ID", row\.model\.providerModelId\)/,
  );
  assert.match(editor, /name="providerModelId"/);
  assert.match(
    editor,
    /Configuration uses OpenRouter request-option field names\. Unknown non-reserved OpenRouter options are preserved\./,
  );
  assert.match(editor, /JSON\.stringify\(row\.model\.configuration, null, 2\)/);
  const normalizedEditor = editor.replace(/\s+/g, " ");
  assert.match(
    normalizedEditor,
    /This model is selected by one or more Agent Configurations\. Changing its availability or disabling it may make those selections unavailable until corrected in Commerce Studio\./,
  );
  assert.doesNotMatch(
    editor,
    /name="(?:credential|apiKey|headers|baseUrl|openRouterModelId)"/,
  );
});

test("mutation form synchronously rejects same-tick duplicate submit events and releases after settle", () => {
  assert.match(mutationForm, /const inFlight = useRef\(false\)/);
  assert.match(mutationForm, /if \(inFlight\.current\)/);
  assert.match(mutationForm, /event\.preventDefault\(\)/);
  assert.match(mutationForm, /inFlight\.current = true/);
  assert.ok(
    mutationForm.indexOf("inFlight.current = true") <
      mutationForm.indexOf("startTransition(async"),
  );
  assert.match(mutationForm, /finally \{[\s\S]*?inFlight\.current = false/);
  assert.match(mutationForm, /disabled=\{pending \|\| locked\}/);
  assert.match(mutationForm, /if \(!result\.ok\) setError\(result\.message\)/);
  assert.match(mutationForm, /Could not save the model catalogue entry\./);
});

test("page treats an empty Availability filter as all and rejects invalid Status values", () => {
  assert.match(
    page,
    /first\(params\.availabilityId\)\?\.trim\(\) \|\| undefined/,
  );
  assert.match(
    page,
    /throw new Error\("Model catalogue status filter is invalid\."\)/,
  );
});

test("Catalogue implementation makes no live OpenRouter request", () => {
  assert.doesNotMatch(
    `${action}\n${service}\n${editor}`,
    /fetch\([^)]*openrouter\.ai/i,
  );
});
