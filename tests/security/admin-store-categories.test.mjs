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
    "src/components/admin/store-categories/prompt-template-list.tsx",
    "src/components/admin/store-categories/prompt-template-workspace.tsx",
    "src/components/admin/store-categories/store-category-maintenance-tabs.tsx",
    "src/components/admin/store-categories/store-category-mapping-workspace.tsx",
    "src/components/admin/store-categories/store-category-workspace-header.tsx",
    "src/components/admin/store-categories/taxonomy-mapping-editor.tsx",
    "src/lib/admin/store-category-taxonomy-reference.ts",
  ];
  const contents = (await Promise.all(files.map(source))).join("\n");
  assert.doesNotMatch(contents, /CommercePromptTemplateTranslation|TranslationJob|Queue\.add|queue\.add/i);
  assert.match(contents, /Merchant presentation falls back to this category display name and description when Shopify locale keys are unavailable/);
});

test("Store Categories uses an atomic authoring session for creation and scoped tabs for maintenance", async () => {
  const page = await source("src/app/(protected)/system-controls/store-categories/page.tsx");
  const catalog = await source("src/components/admin/store-categories/store-category-catalog.tsx");
  const creator = await source("src/components/admin/store-categories/store-category-creation-workspace.tsx");
  const workspace = await source("src/components/admin/store-categories/store-category-authoring-workspace.tsx");
  const categoryStep = await source("src/components/admin/store-categories/store-category-category-step.tsx");
  const templateStep = await source("src/components/admin/store-categories/store-category-template-step.tsx");
  const mappingsStep = await source("src/components/admin/store-categories/store-category-mappings-step.tsx");
  const reviewStep = await source("src/components/admin/store-categories/store-category-review-step.tsx");
  const session = await source("src/components/admin/store-categories/store-category-authoring-session.ts");
  const editor = await source("src/components/admin/store-categories/store-category-editor.tsx");
  const maintenanceTabs = await source("src/components/admin/store-categories/store-category-maintenance-tabs.tsx");

  assert.match(page, /tab\?: string \| string\[\]/);
  assert.match(page, /rawTab === "templates" \|\| rawTab === "taxonomy"/);
  assert.match(catalog, /StoreCategoryCreationWorkspace/);
  assert.doesNotMatch(catalog, /<details className="mb-8/);
  assert.match(creator, /StoreCategoryAuthoringWorkspace/);
  assert.match(creator, /window\.sessionStorage/);
  assert.doesNotMatch(creator, /function CategoryStep|function TemplateStep|function MappingsStep|function ReviewStep/);
  assert.match(workspace, /Nothing is written to PostgreSQL until the final Review step succeeds/);
  assert.match(workspace, /StoreCategoryCategoryStep/);
  assert.match(workspace, /StoreCategoryTemplateStep/);
  assert.match(workspace, /StoreCategoryMappingsStep/);
  assert.match(workspace, /StoreCategoryReviewStep/);
  assert.match(categoryStep, /Category identity/);
  assert.match(templateStep, /Default prompt template/);
  assert.match(mappingsStep, /Category mappings/);
  assert.match(reviewStep, /Review Store Category/);
  assert.match(session, /validationRevision/);
  assert.match(session, /reviewedRevision/);
  assert.match(session, /status: "DRAFT"/);
  assert.match(session, /status: "READY"/);
  assert.match(session, /Readiness is derived from the reviewed configuration/);
  assert.match(workspace, /createInFlightRef/);
  assert.match(reviewStep, /Audit reason supplied/);
  assert.match(reviewStep, /Ready to create/);
  assert.match(maintenanceTabs, /aria-label="Store category sections"/);
  assert.match(maintenanceTabs, /Category details/);
  assert.match(maintenanceTabs, /Prompt templates \(\$\{templateCount\}\)/);
  assert.match(maintenanceTabs, /Category mappings \(\$\{mappingCount\}\)/);

  const templateWorkspace = await source("src/components/admin/store-categories/prompt-template-workspace.tsx");
  const templateList = await source("src/components/admin/store-categories/prompt-template-list.tsx");
  const workspaceHeader = await source("src/components/admin/store-categories/store-category-workspace-header.tsx");
  assert.match(page, /template\?: string \| string\[\]/);
  assert.match(catalog, /Existing categories/);
  assert.match(catalog, /selectedTemplateId=\{selectedTemplateId\}/);
  assert.match(editor, /StoreCategoryWorkspaceHeader/);
  assert.match(editor, /StoreCategoryMaintenanceTabs/);
  assert.match(editor, /PromptTemplateWorkspace/);
  assert.doesNotMatch(editor, /templates\.map\(\(template\) => \(\s*<PromptTemplateEditor/);
  assert.match(templateWorkspace, /Maintain one template at a time/);
  assert.match(templateWorkspace, /PromptTemplateList/);
  assert.match(templateList, /\+ New/);
  assert.match(templateList, /Default/);
  assert.match(workspaceHeader, /Active profiles/);
  assert.match(workspaceHeader, /Default template/);
});


test("Store Category authoring persists human-readable reference taxonomy metadata for cross-platform use", async () => {
  const categoryStep = await source("src/components/admin/store-categories/store-category-category-step.tsx");
  const mappingStep = await source("src/components/admin/store-categories/store-category-mappings-step.tsx");
  const mappingWorkspace = await source("src/components/admin/store-categories/store-category-mapping-workspace.tsx");
  const validation = await source("src/lib/admin/store-category-validation.ts");
  const service = await source("src/lib/admin/store-categories.ts");

  assert.match(categoryStep, /scope="top-level"/);
  assert.match(mappingStep, /StoreCategoryMappingWorkspace/);
  assert.match(mappingStep, /rootTaxonomy=\{session\.category\.referenceTaxonomy\}/);
  assert.match(mappingWorkspace, /scope="subcategories"/);
  assert.match(mappingWorkspace, /rootId=\{rootTaxonomy\.categoryId\}/);
  assert.match(validation, /taxonomyCategoryFullName/);
  assert.match(service, /referenceTaxonomyCategoryFullName/);
  assert.match(service, /taxonomyCategoryName: mapping\.taxonomy\.name/);
  assert.match(service, /taxonomyCategoryFullName: mapping\.taxonomy\.fullName/);
});

test("Store Category reference selection refreshes identity and blocks assigned taxonomy roots", async () => {
  const catalog = await source("src/components/admin/store-categories/store-category-catalog.tsx");
  const creator = await source("src/components/admin/store-categories/store-category-creation-workspace.tsx");
  const workspace = await source("src/components/admin/store-categories/store-category-authoring-workspace.tsx");
  const navigation = await source("src/components/admin/store-categories/store-category-authoring-step-navigation.tsx");
  const categoryStep = await source("src/components/admin/store-categories/store-category-category-step.tsx");
  const picker = await source("src/components/admin/store-categories/shopify-taxonomy-picker.tsx");
  const action = await source("src/app/actions/store-categories.ts");

  assert.match(catalog, /referenceTaxonomyCategoryId/);
  assert.match(catalog, /assignedReferenceTaxonomy=\{assignedReferenceTaxonomy\}/);
  assert.match(creator, /assignedReferenceTaxonomy=\{assignedReferenceTaxonomy\}/);
  assert.match(workspace, /selectedReferenceAssignment/);
  assert.match(workspace, /categoryReferenceAvailable/);
  assert.match(navigation, /categoryReferenceAvailable \|\| entry\.step === "category"/);
  assert.match(categoryStep, /slug: suggestedSlug\(referenceTaxonomy\.name\)/);
  assert.match(categoryStep, /displayName: referenceTaxonomy\.name/);
  assert.doesNotMatch(categoryStep, /session\.category\.displayName\.trim\(\)/);
  assert.match(categoryStep, /Changing the reference category will clear the default template and all category mappings/);
  assert.match(categoryStep, /type: "category\.reference\.changed"/);
  assert.match(categoryStep, /session\.dirty\.defaultTemplate/);
  assert.match(categoryStep, /session\.shopifyMappings\.length > 0/);
  assert.match(categoryStep, /Already assigned to Store Category/);
  assert.match(picker, /unavailableSelections/);
  assert.match(picker, /selectionCommitRef/);
  assert.match(picker, /disabled=\{resultSelectionDisabled\}/);
  assert.match(picker, /actionLabel \?\? "Assigned"/);
  assert.match(action, /referenceTaxonomyCategoryId/);
  assert.match(action, /already used by another Store Category/);

  const session = await source("src/components/admin/store-categories/store-category-authoring-session.ts");
  assert.match(session, /case "category\.reference\.changed"/);
  assert.match(session, /defaultTemplate: createEmptyDefaultTemplate\(\)/);
  assert.match(session, /shopifyMappings: \[\]/);
  assert.match(session, /defaultTemplate: false/);
  assert.match(session, /shopifyMappings: false/);
});


test("Store Category creation and maintenance reuse one compact mapping workspace", async () => {
  const mappingsStep = await source("src/components/admin/store-categories/store-category-mappings-step.tsx");
  const mappingEditor = await source("src/components/admin/store-categories/taxonomy-mapping-editor.tsx");
  const mappingWorkspace = await source("src/components/admin/store-categories/store-category-mapping-workspace.tsx");
  const picker = await source("src/components/admin/store-categories/shopify-taxonomy-picker.tsx");

  assert.match(mappingsStep, /<StoreCategoryMappingWorkspace/);
  assert.match(mappingEditor, /<StoreCategoryMappingWorkspace/);
  assert.doesNotMatch(mappingEditor, /<ShopifyTaxonomyPicker/);
  assert.doesNotMatch(mappingEditor, /<select/);
  assert.equal((mappingWorkspace.match(/<ShopifyTaxonomyPicker/g) ?? []).length, 1);
  assert.match(mappingWorkspace, /Add a mapping/);
  assert.match(mappingWorkspace, /Added mappings \(\{mappings\.length\}\)/);
  assert.match(mappingWorkspace, /showSelectionSummary=\{false\}/);
  assert.match(mappingWorkspace, /selectionActionLabel="Add"/);
  assert.match(mappingWorkspace, /Already added to this Store Category/);
  assert.match(mappingWorkspace, /actionLabel: "Added"/);
  assert.match(mappingsStep, /mapping\.taxonomy\?\.categoryId === taxonomy\.categoryId/);
  assert.match(mappingEditor, /Audit reason for additions/);
  assert.match(mappingEditor, /value="update-taxonomy-mapping"/);
  assert.doesNotMatch(mappingEditor, /<select/);
  assert.match(mappingWorkspace, /To change a taxonomy category/);
  assert.match(picker, /showSelectionSummary/);
  assert.match(picker, /selectionActionLabel/);
  assert.match(picker, /selectionPendingLabel/);
  assert.match(picker, /selectionDisabled/);
});

test("Store Category bundle creation clears committed drafts and surfaces structured server failures", async () => {
  const action = await source("src/app/actions/store-categories.ts");
  const workspace = await source("src/components/admin/store-categories/store-category-authoring-workspace.tsx");
  const session = await source("src/components/admin/store-categories/store-category-authoring-session.ts");

  assert.match(action, /@modainteract\/moda-interact-shared\/logging/);
  assert.match(action, /admin\.store_category\.bundle_create/);
  assert.match(action, /return \{ ok: true, categoryId \}/);
  assert.match(action, /return \{ ok: false, message \}/);
  assert.match(workspace, /if \(!result\.ok\)/);
  assert.match(workspace, /error: result\.message/);
  assert.match(workspace, /router\.replace\(/);
  assert.match(session, /case "save\.succeeded":\s*return null;/);
});
