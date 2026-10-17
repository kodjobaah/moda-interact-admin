import assert from "node:assert/strict";
import test from "node:test";
import {
  PLATFORM_POLICY_CONTRACTS, createConfigurationRegistry, isSafeHttpsUrl,
  publicContracts, validateConfiguration, type ConfigurationContract,
} from "../../src/lib/admin/platform-configuration/contracts.ts";

const registry = createConfigurationRegistry(PLATFORM_POLICY_CONTRACTS);
const fixture: ConfigurationContract = {
  key: "fixture.sample", kind: "policy", requiredRole: "SUPER_ADMIN",
  title: "Test fixture", description: "Unit test only", canReset: false,
  fields: [
    { name: "enabled", kind: "boolean", label: "Enabled", description: "Test switch" },
    { name: "retryLimit", kind: "integer", label: "Retry limit", description: "Bounded", min: 1, max: 5 },
  ],
};

test("production allowlist is exactly six groups with all 26 fields", () => {
  assert.deepEqual([...registry.keys()], ["woo.couponSync", "merchantKnowledge.upload", "speech.transcription", "support.translation", "commerce.preview", "admin.grafana"]);
  assert.equal(PLATFORM_POLICY_CONTRACTS.reduce((sum, contract) => sum + contract.fields.length, 0), 26);
  for (const contract of registry.values()) {
    assert.equal(contract.requiredRole, "SUPER_ADMIN");
    assert.equal(contract.kind, "policy");
    assert.equal(new Set(contract.fields.map((field) => field.name)).size, contract.fields.length);
    assert.equal(contract.canReset, Boolean(contract.defaults));
    if (contract.defaults) assert.deepEqual(validateConfiguration(contract, contract.defaults), { ok: true, values: contract.defaults });
  }
  assert.equal(registry.has("fixture.sample"), false);
});

test("single-source descriptor controls strict types, bounds and unknown fields", () => {
  for (const contract of registry.values()) {
    const input = Object.fromEntries(contract.fields.map((field) => [field.name,
      field.kind === "integer" ? field.min : field.kind === "boolean" ? false :
      field.kind === "enum" ? field.options[0] : field.kind === "nullable-https-url" ? (field.purpose === "r2" ? "https://abc.r2.cloudflarestorage.com" : null) :
      field.kind === "secret" ? "" : field.pattern === "bucket" ? "approved-bucket" : "approved-model"]));
    assert.equal(validateConfiguration(contract, input).ok, true, contract.key);
    for (const field of contract.fields) {
      const rejected = (value: unknown) => {
        const result = validateConfiguration(contract, { ...input, [field.name]: value });
        assert.equal(result.ok, false, `${contract.key}.${field.name}`);
      };
      rejected(undefined);
      if (field.kind === "integer") { rejected(field.min - 1); rejected(field.max + 1); rejected("4"); rejected(1.5); }
      if (field.kind === "boolean") rejected("true");
      if (field.kind === "enum") rejected("unauthorised");
      if (field.kind === "string") { rejected(5); rejected(" "); rejected("x".repeat(field.maxLength + 1)); }
      if (field.kind === "nullable-https-url") { rejected("http://example.com"); rejected("https://user:pass@example.com"); rejected("https://example.com/?token=secret"); rejected("https://example.com/#secret"); }
    }
    assert.equal(validateConfiguration(contract, { ...input, injectedSecret: "sensitive" }).ok, false);
    assert.equal(validateConfiguration(contract, null).ok, false);
  }
});

test("R2 endpoint/bucket are required, placeholders and local origins denied", () => {
  const contract = registry.get("merchantKnowledge.upload")!;
  const base = { maxUploadBytes: 10485760, maxXlsxUncompressedBytes: 52428800, r2Endpoint: "https://valid.r2.cloudflarestorage.com", r2Bucket: "production-bucket" };
  assert.equal(validateConfiguration(contract, base).ok, true);
  for (const endpoint of [null, "", "https://example.invalid", "https://localhost", "https://127.0.0.1", "http://valid.example.com", "https://valid.example.com/?token=x"]) {
    assert.equal(validateConfiguration(contract, { ...base, r2Endpoint: endpoint }).ok, false);
  }
  assert.equal(isSafeHttpsUrl("https://grafana.example.com/dashboards"), true);
  assert.equal(validateConfiguration(contract, { ...base, r2Bucket: "configured-bucket" }).ok, false);
});

test("test-only new group and field need only registry extension", () => {
  const expanded = createConfigurationRegistry([...PLATFORM_POLICY_CONTRACTS, fixture]);
  assert.equal(publicContracts(expanded).some((item) => item.key === "fixture.sample"), true);
  assert.deepEqual(validateConfiguration(expanded.get("fixture.sample")!, { enabled: true, retryLimit: 3 }), { ok: true, values: { enabled: true, retryLimit: 3 } });
  assert.equal(validateConfiguration(expanded.get("fixture.sample")!, { enabled: "true", retryLimit: 10 }).ok, false);
  const changed: ConfigurationContract = { ...fixture, fields: [...fixture.fields, { name: "label", kind: "string", label: "Label", description: "Test only", maxLength: 24 }] };
  const modified = createConfigurationRegistry([...PLATFORM_POLICY_CONTRACTS, changed]);
  assert.equal(publicContracts(modified).find((item) => item.key === "fixture.sample")?.fields.length, 3);
  assert.equal(validateConfiguration(modified.get("fixture.sample")!, { enabled: true, retryLimit: 3 }).ok, false);
  assert.equal(validateConfiguration(modified.get("fixture.sample")!, { enabled: true, retryLimit: 3, label: "value" }).ok, true);
});

test("reserved secrets cannot enter standard policy validation", () => {
  const secret: ConfigurationContract = { key: "auth.test", title: "Secret test", description: "Test only", kind: "secret", requiredRole: "SUPER_ADMIN", canReset: false,
    fields: [{ name: "value", kind: "secret", label: "Secret", description: "Write only", writeOnly: true }] };
  const extended = createConfigurationRegistry([...PLATFORM_POLICY_CONTRACTS, secret]);
  assert.equal(publicContracts(extended).some((item) => item.key === "auth.test"), false);
  assert.equal(validateConfiguration(extended.get("auth.test")!, { value: "anything" }).ok, false);
});
