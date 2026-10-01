import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const sourcePath = (relativePath) => path.join(repositoryRoot, relativePath);

async function readSource(relativePath) {
  return readFile(sourcePath(relativePath), "utf8");
}

const [
  pageSource,
  actionSource,
  serviceSource,
  catalogSource,
  editorSource,
  submitSource,
] = await Promise.all([
  readSource("src/app/(protected)/commerce-models/availability/page.tsx"),
  readSource("src/app/actions/model-availability.ts"),
  readSource("src/lib/admin/model-availability.ts"),
  readSource(
    "src/components/admin/model-availability/model-availability-catalog.tsx",
  ),
  readSource(
    "src/components/admin/model-availability/model-availability-editor.tsx",
  ),
  readSource(
    "src/components/admin/model-availability/model-availability-submit-button.tsx",
  ),
]);

test("Availability page, read service and every mutation have independent authorization", () => {
  assert.match(
    pageSource,
    /const principal = await requirePlatformAdminPage\(\)/,
  );
  assert.match(pageSource, /canMutate=\{principal\.role === "SUPER_ADMIN"\}/);
  const readService = serviceSource.slice(
    serviceSource.indexOf(
      "export async function getModelAvailabilityCatalogue",
    ),
    serviceSource.indexOf(
      "export async function searchModelAvailabilityShopCandidates",
    ),
  );
  assert.ok(readService.indexOf("await requirePlatformAdminRead()") >= 0);
  assert.ok(
    readService.indexOf("await requirePlatformAdminRead()") <
      readService.indexOf("findMany"),
  );
  const searchService = serviceSource.slice(
    serviceSource.indexOf(
      "export async function searchModelAvailabilityShopCandidates",
    ),
    serviceSource.indexOf("export async function mutateModelAvailability"),
  );
  assert.ok(searchService.indexOf("await requirePlatformAdminRead()") >= 0);
  assert.ok(
    searchService.indexOf("await requirePlatformAdminRead()") <
      searchService.indexOf("shop.findMany"),
  );
  const action = actionSource.slice(
    actionSource.indexOf("export async function mutateModelAvailabilityAction"),
  );
  const authIndex = action.indexOf("await requirePlatformAdminMutation()");
  const roleIndex = action.indexOf('principal.role !== "SUPER_ADMIN"');
  const parseIndex = action.indexOf("mutationFromForm(formData)");
  const transactionIndex = action.indexOf("prisma.$transaction(");
  assert.ok(authIndex >= 0);
  assert.ok(roleIndex > authIndex);
  assert.ok(parseIndex > roleIndex);
  assert.ok(transactionIndex > parseIndex);
  assert.match(
    action,
    /ensureDevelopmentPlatformAdmin\(transaction, principal\)/,
  );
  assert.match(action, /isolationLevel: "Serializable"/);
  assert.match(action, /revalidatePath\("\/commerce-models\/availability"\)/);
  assert.match(action, /databaseCode\(error\) === "P2002"/);
  assert.match(action, /databaseCode\(error\) === "P2034"/);
});

test("read model uses Shared schemas, requires one Platform row and exposes bounded counts", () => {
  assert.match(serviceSource, /CommerceModelAvailabilitySchema/);
  assert.match(serviceSource, /CommerceModelAvailabilityScopeSchema/);
  assert.match(serviceSource, /CommerceModelAvailabilitySchema\.parse/);
  assert.match(
    serviceSource,
    /const projectedRows = rows\.map\(\(row\) => \(\{ row, item: projectRow\(row\) \}\)\)/,
  );
  assert.ok(
    serviceSource.indexOf("const projectedRows = rows.map") <
      serviceSource.indexOf("const platformRows = projectedRows.filter"),
  );
  assert.match(serviceSource, /platformRows\.length !== 1/);
  assert.match(
    serviceSource,
    /Platform Model Availability is not configured correctly\./,
  );
  assert.match(
    serviceSource,
    /entries: \{ select: \{ id: true, enabled: true \} \}/,
  );
  assert.match(
    serviceSource,
    /enabledModelCount: row\.entries\.filter\(\(entry\) => entry\.enabled\)\.length/,
  );
  assert.match(
    serviceSource,
    /Shop Model Availability references an unavailable Shop\./,
  );
  assert.doesNotMatch(serviceSource, /configuration\s*:/);
});

test("Shop candidates are case-insensitive, bounded, ordered and exclude existing Availability", () => {
  const search = serviceSource.slice(
    serviceSource.indexOf(
      "export async function searchModelAvailabilityShopCandidates",
    ),
    serviceSource.indexOf("export async function mutateModelAvailability"),
  );
  assert.match(search, /search\.trim\(\)\.slice\(0, 120\)/);
  assert.match(search, /if \(term\.length < 2\) return \[\]/);
  assert.match(search, /contains: term, mode: "insensitive"/);
  assert.match(search, /commerceModelAvailability: \{ is: null \}/);
  assert.match(search, /orderBy: \[\{ domain: "asc" \}, \{ id: "asc" \}\]/);
  assert.match(search, /take: 25/);
  assert.match(search, /select: \{ id: true, domain: true, status: true \}/);
});

test("Availability management has no catalogue, Agent Configuration, credential or deletion mutation path", () => {
  const implementation = [
    pageSource,
    actionSource,
    serviceSource,
    catalogSource,
    editorSource,
  ].join("\n");
  assert.doesNotMatch(
    implementation,
    /commerceModelCatalogueEntry\.(?:create|update|updateMany)/,
  );
  assert.doesNotMatch(
    implementation,
    /commerceAgentConfiguration\.(?:create|update|updateMany)/,
  );
  assert.doesNotMatch(implementation, /commerceOpenRouterCredential/);
  assert.doesNotMatch(
    implementation,
    /deleteModelAvailability|removeModelAvailability|intent\s*=\s*["']delete|commerceModelAvailability\.delete(?:Many)?/,
  );
  assert.match(serviceSource, /action: "CREATE_MODEL_AVAILABILITY"/);
  assert.match(
    serviceSource,
    /action: mutation\.input\.enabled[\s\S]*?"ENABLE_MODEL_AVAILABILITY"[\s\S]*?"DISABLE_MODEL_AVAILABILITY"/,
  );
});

test("Availability page explains scope and UI limits writes to Super Admin with pending protection", () => {
  const normalizedCatalog = catalogSource.replace(/\s+/g, " ");
  const normalizedEditor = editorSource.replace(/\s+/g, " ");
  assert.match(normalizedCatalog, /Model availability/);
  assert.match(
    normalizedCatalog,
    /Availability controls which catalogue models may be selected for Platform or a Shop/,
  );
  assert.match(
    normalizedCatalog,
    /It does not select the active CommerceAgent model/,
  );
  assert.match(
    normalizedCatalog,
    /No Shop-specific model availability has been configured\./,
  );
  assert.match(
    normalizedEditor,
    /No Shops without Model Availability match this search\./,
  );
  assert.match(
    normalizedEditor,
    /Disabling Platform availability removes Platform catalogue models from every Shop's effective available set\. Existing Agent model selections are not rewritten\./,
  );
  assert.match(
    normalizedEditor,
    /Disabling this Shop availability removes its private catalogue models from this Shop's effective available set\. Existing Agent model selections are not rewritten\./,
  );
  const manageForm = editorSource.slice(
    editorSource.indexOf("const { item, canMutate } = props"),
  );
  assert.doesNotMatch(manageForm, /name="scope"|name="shopId"/);
  assert.match(editorSource, /canMutate \? \(/);
  assert.match(submitSource, /useFormStatus\(\)/);
  assert.match(submitSource, /disabled=\{pending\}/);
  assert.match(submitSource, /pending \? pendingLabel : idleLabel/);
});
