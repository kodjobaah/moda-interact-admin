import assert from "node:assert/strict";
import test from "node:test";
import { CredentialSecurityError } from "@modainteract/moda-interact-shared/security/credentials/node";
import {
  loadActiveSharedCredentialKeyring,
} from "../../src/lib/admin/shared-credential-keyring.ts";
import { CREDENTIAL_ENCRYPTION_UNAVAILABLE } from "../../src/lib/admin/shared-credential-keyring.ts";

const keysBefore = process.env.COMMERCE_CONNECTION_KEYS_JSON;
const activeBefore = process.env.COMMERCE_CONNECTION_ACTIVE_KEY_ID;
const key = Buffer.alloc(32, 7).toString("base64");

function setKeyring(raw: string | undefined, active: string | undefined): void {
  if (raw === undefined) delete process.env.COMMERCE_CONNECTION_KEYS_JSON;
  else process.env.COMMERCE_CONNECTION_KEYS_JSON = raw;
  if (active === undefined) delete process.env.COMMERCE_CONNECTION_ACTIVE_KEY_ID;
  else process.env.COMMERCE_CONNECTION_ACTIVE_KEY_ID = active;
}

test("writer uses canonical Shared keyring and active ID without exposing bytes", () => {
  setKeyring(JSON.stringify({ active: key, old: Buffer.alloc(32, 9).toString("base64") }), "active");
  const result = loadActiveSharedCredentialKeyring();
  assert.equal(result.activeKeyId, "active");
  assert.deepEqual(result.keyring.keyIds, ["active", "old"]);
  assert.equal(result.keyring.hasKey("old"), true);
  assert.equal("active" in result.keyring, false);
});

test("invalid configuration, duplicate IDs, noncanonical Base64 and implicit ID fail closed", () => {
  const invalid: Array<[string | undefined, string | undefined]> = [
    [undefined, "active"],
    ["{}", "active"],
    ["invalid", "active"],
    ['{"active":"' + key + '","active":"' + key + '"}', "active"],
    [JSON.stringify({ active: Buffer.alloc(31).toString("base64") }), "active"],
    [JSON.stringify({ active: key.replace(/=$/, "") }), "active"],
    [JSON.stringify({ active: key }), undefined],
    [JSON.stringify({ active: key }), " active "],
    [JSON.stringify({ active: key }), "missing"],
  ];
  for (const [raw, active] of invalid) {
    setKeyring(raw, active);
    assert.throws(() => loadActiveSharedCredentialKeyring(), {
      message: CREDENTIAL_ENCRYPTION_UNAVAILABLE,
    });
  }
});

test("keyring does not reveal underlying Shared error codes", () => {
  setKeyring("bad-json", "active");
  assert.throws(() => loadActiveSharedCredentialKeyring(), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, CREDENTIAL_ENCRYPTION_UNAVAILABLE);
    assert.equal(error instanceof CredentialSecurityError, false);
    return true;
  });
});

test.after(() => setKeyring(keysBefore, activeBefore));
