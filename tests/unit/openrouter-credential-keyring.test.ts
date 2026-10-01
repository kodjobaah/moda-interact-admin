import assert from "node:assert/strict";
import test from "node:test";
import {
  CREDENTIAL_ENCRYPTION_UNAVAILABLE,
  loadActiveCredentialKeyring,
} from "../../src/lib/admin/openrouter-credential-keyring.ts";

const originalKeys = process.env.COMMERCE_CONNECTION_KEYS_JSON;
const originalActive = process.env.COMMERCE_CONNECTION_ACTIVE_KEY_ID;
const validKey = Buffer.alloc(32, 7).toString("base64");

test("keyring decodes all keys and returns the configured active ID", () => {
  process.env.COMMERCE_CONNECTION_KEYS_JSON = JSON.stringify({
    active: validKey,
  });
  process.env.COMMERCE_CONNECTION_ACTIVE_KEY_ID = " active ";
  const loaded = loadActiveCredentialKeyring();
  assert.equal(loaded.activeKeyId, "active");
  assert.deepEqual(loaded.keyring.active, new Uint8Array(Buffer.alloc(32, 7)));
});

test("invalid JSON, IDs, values, key lengths and active references share one bounded error", () => {
  const invalid = [
    undefined,
    "[]",
    "{}",
    JSON.stringify({ " ": validKey }),
    JSON.stringify({ key: "not-base64!" }),
    JSON.stringify({ key: Buffer.alloc(31).toString("base64") }),
    JSON.stringify({ key: `${validKey.slice(0, -2)}AB` }),
  ];
  for (const raw of invalid) {
    process.env.COMMERCE_CONNECTION_KEYS_JSON = raw;
    process.env.COMMERCE_CONNECTION_ACTIVE_KEY_ID = "key";
    assert.throws(() => loadActiveCredentialKeyring(), {
      message: CREDENTIAL_ENCRYPTION_UNAVAILABLE,
    });
  }
  process.env.COMMERCE_CONNECTION_KEYS_JSON = JSON.stringify({ key: validKey });
  process.env.COMMERCE_CONNECTION_ACTIVE_KEY_ID = "missing";
  assert.throws(() => loadActiveCredentialKeyring(), {
    message: CREDENTIAL_ENCRYPTION_UNAVAILABLE,
  });
});

test.after(() => {
  if (originalKeys === undefined)
    delete process.env.COMMERCE_CONNECTION_KEYS_JSON;
  else process.env.COMMERCE_CONNECTION_KEYS_JSON = originalKeys;
  if (originalActive === undefined)
    delete process.env.COMMERCE_CONNECTION_ACTIVE_KEY_ID;
  else process.env.COMMERCE_CONNECTION_ACTIVE_KEY_ID = originalActive;
});
