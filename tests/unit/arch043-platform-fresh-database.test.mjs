import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
const source = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");

test("no duplicate R2 or support translation policy or retirement switch", () => {
  const registry = source("src/lib/admin/platform-configuration/contracts.ts");
  const page = source("src/app/(protected)/system-controls/platform-configuration/page.tsx");
  const writer = source("src/lib/admin/platform-configuration/service.ts") + source("src/lib/admin/platform-configuration/mutate.ts");
  assert.doesNotMatch(registry, /key: "merchantKnowledge\.upload"|key: "support\.translation"/);
  assert.doesNotMatch(page + writer, /legacy-retirement|legacyR2Reconciliation|legacyTranslationStatus|MODA_ARCH043_DISABLE_LEGACY_POLICY_EDITORS/);
  assert.match(page, /publicContracts\(PLATFORM_CONFIGURATION_REGISTRY, true\)/);
  for (const name of ["legacy-r2-assessment", "legacy-r2-reconciliation", "legacy-retirement", "legacy-translation-assessment", "legacy-translation-reconciliation"]) {
    assert.equal(existsSync(new URL(`../../src/lib/admin/platform-configuration/${name}.ts`, import.meta.url)), false);
  }
});

test("stored AI provider credentials use the same strict speech-only contract as new writes", () => {
  const validator = source("src/lib/admin/platform-configuration/secret-validation.ts");
  const service = source("src/lib/admin/platform-configuration/secret-service.ts");
  const editor = source("src/components/admin/platform-configuration/secret-configuration-editor.tsx");
  assert.doesNotMatch(validator, /validateStoredAiProviderPayload|retiredTranslationKeyPresent/);
  assert.doesNotMatch(service + editor, /translationMigrationAcknowledged|legacyAiTranslationKeyPresent/);
  assert.match(service, /validateSecretPayload\(key, decoded\)/);
  assert.match(service, /validateSecretPayload\(key, current\)/);
  assert.match(validator, /Configure at least one approved AI provider key/);
});
