import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const source = (relativePath) =>
  readFile(path.join(repositoryRoot, relativePath), "utf8");

test("System Controls exposes one Embeddings destination", async () => {
  const [sidebar, shell, page] = await Promise.all([
    source("src/components/admin/sidebar.tsx"),
    source("src/components/admin/admin-shell.tsx"),
    source("src/app/(protected)/system-controls/embeddings/page.tsx"),
  ]);
  assert.equal(
    [...sidebar.matchAll(/href="\/system-controls\/embeddings"/g)].length,
    1,
  );
  assert.match(sidebar, /Embeddings/);
  assert.match(sidebar, /active === "embeddings"/);
  assert.match(shell, /\| "embeddings"/);
  assert.match(page, /requirePlatformAdminPage\(\)/);
  assert.match(page, /<AdminShell active="embeddings">/);
  assert.match(page, /principal\.role === "SUPER_ADMIN"/);
});

test("embedding configuration is environment and purpose scoped", async () => {
  const service = await source("src/lib/admin/embedding-configuration.ts");
  assert.match(service, /CommerceEmbeddingPurpose\.MERCHANT_KNOWLEDGE/);
  assert.match(service, /CommerceEmbeddingPurpose\.REFERENCE_TAXONOMY/);
  assert.match(service, /resolveCommerceEnvironment\(\)/);
  assert.match(service, /environment_purpose/);
  assert.match(service, /@@unique|purpose: validated\.purpose/);
  assert.match(service, /isolationLevel: "Serializable"/);
  assert.match(service, /ensureDevelopmentPlatformAdmin/);
  assert.match(service, /editVersion: \{ increment: 1 \}/);
});

test("browser payload never exposes the stored embedding secret envelope", async () => {
  const [service, panel] = await Promise.all([
    source("src/lib/admin/embedding-configuration.ts"),
    source(
      "src/components/admin/embedding-configuration/embedding-configurations-panel.tsx",
    ),
  ]);
  const status = service.slice(
    service.indexOf("export type EmbeddingConfigurationStatus"),
    service.indexOf("export const EMBEDDING_CONFIGURATION_ERRORS"),
  );
  assert.doesNotMatch(status, /ciphertext|nonce|authTag|keyId|secret/);
  assert.match(panel, /type=\{showSecret \? "text" : "password"\}/);
  assert.match(panel, /A saved credential cannot be viewed from Admin/);
  assert.doesNotMatch(panel, /ciphertext|authTag|keyId/);
});

test("embedding credentials use the shared keyring and purpose-bound AES-GCM AAD", async () => {
  const [crypto, service] = await Promise.all([
    source("src/lib/admin/embedding-configuration-crypto.ts"),
    source("src/lib/admin/embedding-configuration.ts"),
  ]);
  assert.match(crypto, /createCipheriv\("aes-256-gcm"/);
  assert.match(crypto, /createDecipheriv\("aes-256-gcm"/);
  assert.match(crypto, /openEmbeddingCredential/);
  assert.match(crypto, /canonicalJson\(\{/);
  assert.match(crypto, /credentialType: "EMBEDDING"/);
  assert.match(crypto, /environment: input\.environment/);
  assert.match(crypto, /purpose: input\.purpose/);
  assert.match(crypto, /provider: input\.provider/);
  assert.match(service, /loadActiveCredentialKeyring\(\)/);
  assert.doesNotMatch(service, /process\.env\.EMBEDDING_API_KEY/);
});

test("embedding configuration mutations are audited without credentials", async () => {
  const service = await source("src/lib/admin/embedding-configuration.ts");
  assert.match(service, /CommerceAuditAction\.SET_EMBEDDING_CONFIGURATION/);
  assert.match(service, /CommerceAuditAction\.REPLACE_EMBEDDING_CONFIGURATION/);
  assert.match(service, /CommerceAuditAction\.REMOVE_EMBEDDING_CONFIGURATION/);
  assert.match(service, /credentialReplaced: Boolean\(validated\.secret\)/);
  for (const secretField of ["ciphertext", "nonce", "authTag", "keyId"]) {
    assert.doesNotMatch(
      service.match(/metadata: \{[\s\S]*?\n\s*\},/g)?.join("\n") ?? "",
      new RegExp(`${secretField}:`),
    );
  }
});
