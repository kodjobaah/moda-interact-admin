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

test("translation credential uses Shared 1.2.0 AAD and the existing Commerce keyring", () => {
  const dependency = JSON.parse(packageJson).dependencies[
    "@modainteract/moda-interact-shared"
  ];
  assert.equal(dependency, "1.2.0");
  assert.match(cryptoSource, /createCommerceTranslationProviderCredentialAad/);
  assert.match(cryptoSource, /provider: input\.provider/);
  assert.match(service, /loadActiveCredentialKeyring\(\)/);
  assert.doesNotMatch(cryptoSource, /createDecipheriv/);
});

test("translation configuration UI has synchronous single-flight mutation guards", () => {
  for (const component of [credential, modelForm]) {
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

test("sidebar exposes Translations under System Controls", () => {
  assert.match(sidebar, /href="\/system-controls\/translations"/);
  assert.match(sidebar, /active === "translations"/);
  assert.match(sidebar, />\s*Translations\s*</);
  assert.match(shell, /\| "translations"/);
  assert.match(page, /<AdminShell active="translations">/);
});
