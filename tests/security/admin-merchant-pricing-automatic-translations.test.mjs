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

test("ADMIN-002 leaves the existing workbook final mutation operational for the later integration task", () => {
  assert.match(finalMutationSource, /formData\.get\("translationJson"\)/);
  assert.match(finalMutationSource, /assertTranslation/);
  assert.doesNotMatch(finalMutationSource, /translationRunId/);
});

test("new Merchant Pricing translation semantic logs use the Shared logger", () => {
  assert.match(serviceSource, /@modainteract\/moda-interact-shared\/logging/);
  assert.match(serviceSource, /admin\.merchant_pricing\.translation_requested/);
  assert.match(serviceSource, /admin\.merchant_pricing\.translation_request_failed/);
  assert.doesNotMatch(serviceSource, /console\.(log|warn|error)/);
});
