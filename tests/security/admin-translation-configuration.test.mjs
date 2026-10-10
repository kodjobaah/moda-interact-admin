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

const [
  page,
  action,
  configurationService,
  credentialService,
  modelService,
  cryptoSource,
  validation,
  panel,
  credential,
  models,
  modelForm,
  automaticDefaultForm,
  sidebar,
  shell,
  packageJson,
] = await Promise.all([
  source("src/app/(protected)/system-controls/translations/page.tsx"),
  source("src/app/actions/translation-configuration.ts"),
  source("src/lib/admin/translation-configuration.ts"),
  source("src/lib/admin/translation-provider-credential-service.ts"),
  source("src/lib/admin/translation-model-configuration-service.ts"),
  source("src/lib/admin/translation-credential-crypto.ts"),
  source("src/lib/admin/translation-configuration-validation.ts"),
  source(
    "src/components/admin/translation-configuration/translation-configurations-panel.tsx",
  ),
  source(
    "src/components/admin/translation-configuration/translation-provider-credential.tsx",
  ),
  source(
    "src/components/admin/translation-configuration/translation-model-configurations.tsx",
  ),
  source(
    "src/components/admin/translation-configuration/translation-model-configuration-form.tsx",
  ),
  source(
    "src/components/admin/translation-configuration/translation-model-automatic-default-form.tsx",
  ),
  source("src/components/admin/sidebar.tsx"),
  source("src/components/admin/admin-shell.tsx"),
  source("package.json"),
]);

const service = `${configurationService}\n${credentialService}\n${modelService}`;

test("Translations page is protected, environment-scoped, and read-only for non-SUPER_ADMIN users", () => {
  assert.match(page, /requirePlatformAdminPage\(\)/);
  assert.match(page, /getTranslationConfigurationAdminData\(\)/);
  assert.match(page, /canMutate=\{principal\.role === "SUPER_ADMIN"\}/);
  assert.match(service, /requirePlatformAdminRead\(\)/);
  assert.match(service, /resolveCommerceEnvironment\(\)/);
  assert.match(service, /provider: TRANSLATION_PROVIDER/);
  assert.doesNotMatch(`${page}\n${panel}`, /environment selector/i);
});

test("all translation mutations independently require SUPER_ADMIN before form parsing", () => {
  for (const name of [
    "setTranslationProviderCredentialAction",
    "replaceTranslationProviderCredentialAction",
    "removeTranslationProviderCredentialAction",
    "createTranslationModelConfigurationAction",
    "updateTranslationModelConfigurationAction",
    "setTranslationModelConfigurationAutomaticDefaultAction",
    "setTranslationModelConfigurationEnabledAction",
  ]) {
    const start = action.indexOf(`export async function ${name}`);
    assert.ok(start >= 0, `${name} should be exported`);
    const next = action.indexOf("export async function", start + 1);
    const body = action.slice(start, next < 0 ? undefined : next);
    assert.ok(body.indexOf("requireSuperAdmin()") < body.indexOf("return finish("));
  }
  assert.match(action, /principal\.role !== "SUPER_ADMIN"/);
  assert.match(action, /revalidatePath\("\/system-controls\/translations"\)/);
  assert.doesNotMatch(action, /return\s+cause|JSON\.stringify\(cause/);
});

test("credential status never returns encrypted envelope fields and only OpenAI is configurable in v1", () => {
  const statusBlock = service.slice(
    service.indexOf("export type TranslationProviderCredentialStatus"),
    service.indexOf("export type TranslationModelConfigurationView"),
  );
  assert.doesNotMatch(
    statusBlock,
    /ciphertext|nonce|authTag|keyId|secret|fingerprint|hash/,
  );
  assert.match(validation, /TRANSLATION_PROVIDER = "openai"/);
  assert.doesNotMatch(`${panel}\n${credential}\n${models}`, /name="provider"|Provider selector|<select/i);
  assert.match(credential, />OpenAI</);
});

test("translation credential uses the published Shared AAD and the existing Commerce keyring", () => {
  const dependency = JSON.parse(packageJson).dependencies[
    "@modainteract/moda-interact-shared"
  ];
  assert.match(dependency, /^\d+\.\d+\.\d+$/);
  assert.match(cryptoSource, /createCommerceTranslationProviderCredentialAad/);
  assert.match(cryptoSource, /provider: input\.provider/);
  assert.match(service, /loadActiveCredentialKeyring\(\)/);
  assert.doesNotMatch(cryptoSource, /createDecipheriv/);
});

test("translation configuration UI has synchronous single-flight mutation guards", () => {
  for (const component of [credential, modelForm, automaticDefaultForm]) {
    assert.match(component, /const inFlight = useRef\(false\)/);
    assert.match(component, /if \(inFlight\.current \|\| refreshRequired\) return;/);
    assert.ok(component.indexOf("inFlight.current = true") < component.indexOf("await "));
    assert.match(component, /flushSync\(\(\) => \{/);
    assert.match(component, /aria-busy=\{pending\}/);
    assert.match(component, /finally[\s\S]*?inFlight\.current = false/);
  }
  assert.match(credential, /secretRef\.current\.value = ""/);
  assert.match(credential, /Saved credentials\s+cannot be viewed from Admin\./);
});

test("service uses Serializable CAS mutations, audit events, and shared structured logging without executing translations", () => {
  assert.match(service, /isolationLevel: "Serializable"/);
  assert.match(service, /editVersion: \{ increment: 1 \}/);
  assert.match(service, /CommerceAuditAction\.SET_TRANSLATION_PROVIDER_CREDENTIAL/);
  assert.match(service, /CommerceAuditAction\.CREATE_TRANSLATION_MODEL_CONFIGURATION/);
  assert.match(service, /CommerceAuditAction\.ENABLE_TRANSLATION_MODEL_CONFIGURATION/);
  assert.match(service, /CommerceAuditAction\.DISABLE_TRANSLATION_MODEL_CONFIGURATION/);
  assert.match(service, /createLogger\(/);
  assert.match(service, /admin\.translation_provider_credential\.updated/);
  assert.match(service, /admin\.translation_model_configuration\.created/);
  assert.doesNotMatch(
    `${service}\n${action}\n${panel}\n${credential}\n${models}\n${modelForm}`,
    /translation-dispatch|translation-batch|BullMQ|Queue\(|fetch\(|\/v1\/responses/,
  );
});

test("credential removal is blocked once model profiles reference the credential", () => {
  assert.match(service, /existing\._count\.models > 0/);
  assert.match(service, /credentialInUse/);
  assert.match(credential, /status\.modelCount === 0/);
  assert.match(credential, /cannot be removed while translation model\s+profiles reference it/);
});

test("automatic translation default is explicit, CAS-protected, atomic, and audited", () => {
  assert.match(configurationService, /automaticDefault: true/);
  assert.match(modelService, /setTranslationModelConfigurationAutomaticDefault/);
  assert.match(modelService, /validateTranslationModelAutomaticDefaultMutation/);
  assert.match(modelService, /existing\.editVersion !== validated\.expectedEditVersion/);
  assert.match(modelService, /if \(!existing\.enabled\)/);
  assert.match(modelService, /automaticDefault: true,[\s\S]*?id: \{ not: existing\.id \}/);
  assert.match(modelService, /automaticDefault: false,[\s\S]*?editVersion: \{ increment: 1 \}/);
  assert.match(modelService, /enabled: true,[\s\S]*?automaticDefault: false,[\s\S]*?editVersion: validated\.expectedEditVersion/);
  assert.match(modelService, /action: CommerceAuditAction\.UPDATE_TRANSLATION_MODEL_CONFIGURATION/);
  assert.match(modelService, /change: "automaticDefault"/);
  assert.match(modelService, /admin\.translation_model_configuration\.automatic_default_set/);
  assert.match(action, /setTranslationModelConfigurationAutomaticDefaultAction/);
  assert.match(action, /expectedEditVersion: positiveInteger/);
});

test("automatic default cannot be disabled and the UI explains the required replacement", () => {
  assert.match(
    modelService,
    /!validated\.enabled && existing\.automaticDefault[\s\S]*?modelAutomaticDefaultDisableBlocked/,
  );
  assert.match(
    modelForm,
    /disableBlocked = model\.enabled && model\.automaticDefault/,
  );
  assert.match(
    modelForm,
    /Choose another automatic-default translation model before disabling this model\./,
  );
  assert.match(models, />\s*Automatic default\s*</);
  assert.match(models, /models\.some\([\s\S]*?model\.automaticDefault/);
  assert.match(
    models,
    /No automatic translation default is configured for this environment\./,
  );
  assert.match(models, /Merchant Pricing translation/);
  assert.doesNotMatch(models, /models\.(?:find|findIndex)\([^)]*enabled/);
});

test("only enabled non-default models expose the automatic-default mutation control", () => {
  assert.match(
    models,
    /model\.automaticDefault[\s\S]*?: model\.enabled \?[\s\S]*?<TranslationModelAutomaticDefaultForm/,
  );
  assert.match(
    models,
    /Enable this model before setting it as the automatic[\s\S]*?translation default\./,
  );
  assert.match(automaticDefaultForm, /Set as automatic default/);
  assert.match(automaticDefaultForm, /const inFlight = useRef\(false\)/);
  assert.match(
    automaticDefaultForm,
    /if \(inFlight\.current \|\| refreshRequired\) return;/,
  );
});

test("sidebar exposes Translations under System Controls", () => {
  assert.match(sidebar, /href="\/system-controls\/translations"/);
  assert.match(sidebar, /active === "translations"/);
  assert.match(sidebar, />\s*Translations\s*</);
  assert.match(shell, /\| "translations"/);
  assert.match(page, /<AdminShell active="translations">/);
});
