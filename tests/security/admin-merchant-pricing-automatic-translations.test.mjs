import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const actionSource = fs.readFileSync(
  path.join(root, "src/app/actions/merchant-pricing-translations.ts"),
  "utf8",
);
const serviceSource = fs.readFileSync(
  path.join(
    root,
    "src/lib/admin/merchant/merchant-pricing-translation-runs.ts",
  ),
  "utf8",
);
const sourceHelper = fs.readFileSync(
  path.join(
    root,
    "src/lib/admin/merchant/merchant-pricing-automatic-translations.ts",
  ),
  "utf8",
);
const finalMutationSource = fs.readFileSync(
  path.join(root, "src/app/actions/merchant-pricing-plan.ts"),
  "utf8",
);

test("automatic Merchant Pricing translation mutation authenticates SUPER_ADMIN before parsing input", () => {
  const functionStart = actionSource.indexOf(
    "export async function requestMerchantPricingTranslationAction",
  );
  const authIndex = actionSource.indexOf(
    "await requirePlatformAdminMutation()",
    functionStart,
  );
  const roleIndex = actionSource.indexOf(
    'principal.role !== "SUPER_ADMIN"',
    functionStart,
  );
  const parseIndex = actionSource.indexOf("inputObject(rawInput)", functionStart);
  assert.ok(functionStart >= 0);
  assert.ok(authIndex > functionStart);
  assert.ok(roleIndex > authIndex);
  assert.ok(parseIndex > roleIndex);
});

test("automatic Merchant Pricing translation request has no browser model selector", () => {
  assert.doesNotMatch(actionSource, /translationModelConfigurationId:\s*input\./);
  assert.doesNotMatch(actionSource, /providerModelId:\s*input\./);
  assert.match(serviceSource, /automaticDefault:\s*true/);
  assert.match(serviceSource, /enabled:\s*true/);
  assert.match(serviceSource, /provider:\s*TRANSLATION_PROVIDER/);
  assert.match(
    serviceSource,
    /Automatic translation is not configured\. Choose an automatic-default translation model in System Controls \/ Translations\./,
  );
});

test("translation request only persists durable PostgreSQL work and does not call provider or queue code", () => {
  assert.match(serviceSource, /merchantPricingTranslationRun\.create/);
  assert.match(serviceSource, /merchantPricingTranslationItem\.createMany/);
  assert.doesNotMatch(serviceSource, /BullMQ|Queue\(|addBulk\(|createOpenAITranslationProvider/);
  assert.doesNotMatch(actionSource, /BullMQ|Queue\(|createOpenAITranslationProvider/);
});

test("status reads require platform-admin authorization and return bounded progress", () => {
  const functionStart = actionSource.indexOf(
    "export async function getMerchantPricingTranslationStatusAction",
  );
  const authIndex = actionSource.indexOf(
    "await requirePlatformAdminRead()",
    functionStart,
  );
  assert.ok(functionStart >= 0);
  assert.ok(authIndex > functionStart);
  assert.match(serviceSource, /completeLocaleCount/);
  assert.match(serviceSource, /pendingItemCount/);
  assert.match(serviceSource, /failedItemCount/);
  assert.doesNotMatch(actionSource, /translatedText|sourceText|providerBatchId|inputFileId|outputFileId/);
});

test("canonical source is content-key sorted and uses the Shared language registry", () => {
  assert.match(sourceHelper, /MODA_SUPPORTED_LANGUAGE_TAGS/);
  assert.match(sourceHelper, /left\.contentKey\.localeCompare\(right\.contentKey\)/);
  assert.match(sourceHelper, /createHash\("sha256"\)/);
  assert.doesNotMatch(sourceHelper, /displayName|recurringAmount|supportedFeature/);
});

test("ready package reconstruction revalidates run status, handle, source hash, exact items and canonical parser", () => {
  assert.match(serviceSource, /READY_TO_APPLY/);
  assert.match(serviceSource, /run\.shopifyPlanHandle !== source\.shopifyPlanHandle/);
  assert.match(serviceSource, /run\.sourceHash !== sourceHash/);
  assert.match(serviceSource, /seen\.size !== expectedIdentities\.size/);
  assert.match(serviceSource, /parseCompletedMerchantPricingTranslationPackage/);
});

test("ADMIN-003 save persists an inactive English-only draft linked to durable translation work", () => {
  assert.match(finalMutationSource, /formData\.get\("translationRunId"\)/);
  assert.doesNotMatch(finalMutationSource, /formData\.get\("translationJson"\)/);
  assert.match(finalMutationSource, /ensureMerchantPricingTranslationRunForDraftSave/);
  assert.match(finalMutationSource, /publicationStatus:\s*translationRun!\.publicationStatus/);
  assert.match(finalMutationSource, /currentTranslationRunId:\s*translationRun!\.runId/);
  assert.match(finalMutationSource, /isActive:\s*false/);
  assert.match(finalMutationSource, /locale:\s*"en"/);
  assert.doesNotMatch(finalMutationSource, /markMerchantPricingTranslationRunApplied/);
  assert.match(finalMutationSource, /isolationLevel:\s*"Serializable"/);
  assert.match(serviceSource, /DRAFT_PERSISTABLE_RUN_STATUSES/);
});

test("new Merchant Pricing translation semantic logs use the Shared logger", () => {
  assert.match(serviceSource, /@modainteract\/moda-interact-shared\/logging/);
  assert.match(serviceSource, /admin\.merchant_pricing\.translation_requested/);
  assert.match(serviceSource, /admin\.merchant_pricing\.translation_request_failed/);
  assert.doesNotMatch(serviceSource, /console\.(log|warn|error)/);
});


test("ADMIN-003 starts translation only from save/retry and polls persisted work without exposing workbook controls", () => {
  const builder = fs.readFileSync(
    path.join(root, "src/components/admin/merchant/merchant-pricing-plan-builder.tsx"),
    "utf8",
  );
  const step = fs.readFileSync(
    path.join(root, "src/components/admin/merchant/merchant-pricing-plan-builder/translations-review-step.tsx"),
    "utf8",
  );
  const hook = fs.readFileSync(
    path.join(root, "src/components/admin/merchant/merchant-pricing-plan-builder/use-merchant-pricing-automatic-translation.ts"),
    "utf8",
  );
  assert.match(builder, /name="translationRunId"/);
  assert.doesNotMatch(builder, /translationJson|MerchantPricingTranslationWorkbook/);
  assert.doesNotMatch(step, /Download pre-populated translation spreadsheet|Choose spreadsheet|\.xlsx/);
  assert.match(hook, /requestMerchantPricingTranslationAction/);
  assert.match(hook, /getMerchantPricingTranslationStatusAction/);
  assert.doesNotMatch(hook, /void requestRun\(false\)/);
  assert.match(step, /automatic translation begins after this draft is saved/);
  assert.match(hook, /window\.setInterval/);
  assert.match(hook, /window\.clearInterval/);
  assert.match(hook, /merchantPricingAutomaticTranslationTerminal/);
  assert.match(hook, /input\.initialRunId/);
  assert.match(hook, /getMerchantPricingTranslationStatusAction\(input\.initialRunId\)/);
  assert.match(hook, /runSourceKey === sourceKey/);
  assert.match(hook, /message\.sourceKey === sourceKey/);
  assert.doesNotMatch(hook, /router\.refresh/);
});

test("ADMIN-003 preserves translations on reorder-only edits without provider work", () => {
  assert.match(finalMutationSource, /merchantPricingHighlightOrderChanged/);
  assert.match(finalMutationSource, /reorderMerchantPricingHighlights/);
  assert.match(finalMutationSource, /position:\s*\{\s*increment:\s*highlights\.length\s*\}/);
  assert.match(finalMutationSource, /!contentChanged/);
});

test("translation draft-save semantic logs use Shared logging and contain no translation text", () => {
  assert.match(finalMutationSource, /@modainteract\/moda-interact-shared\/logging/);
  assert.match(finalMutationSource, /admin\.merchant_pricing\.translation_draft_saved/);
  assert.match(finalMutationSource, /admin\.merchant_pricing\.translation_draft_save_failed/);
  assert.doesNotMatch(finalMutationSource, /translatedText:\s*|sourceText:\s*/);
});

test("persisted translation drafts reload their current run and retries can relink unchanged draft content", () => {
  assert.match(serviceSource, /relinkPersistedDraftRunIfUnchanged/);
  assert.match(serviceSource, /currentTranslationRunId:\s*input\.runId/);
  assert.match(serviceSource, /MerchantPricingPlanPublicationStatus\.TRANSLATION_FAILED/);
  assert.match(serviceSource, /MerchantPricingPlanPublicationStatus\.TRANSLATING/);
});
