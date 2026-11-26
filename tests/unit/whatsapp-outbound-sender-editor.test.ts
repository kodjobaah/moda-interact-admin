import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PLATFORM_SECRET_CONTRACTS, secretEditorFields } from "../../src/lib/admin/platform-configuration/secrets-contracts.ts";

const sender = PLATFORM_SECRET_CONTRACTS.find(({ key }) => key === "messaging.sender")!;

test("configured WhatsApp sender exposes only account credentials; stored contract stays intact", () => {
  assert.deepEqual(secretEditorFields(sender, true).map(({ name }) => name), ["accessToken", "businessAccountId"]);
  assert.deepEqual(sender.fields.map(({ name }) => name), ["accessToken", "phoneNumberId", "businessAccountId"]);
  const editor = readFileSync(new URL("../../src/components/admin/platform-configuration/secret-configuration-editor.tsx", import.meta.url), "utf8");
  assert.match(editor, /const fields = secretEditorFields\(contract, status\.configured\)/);
  assert.match(editor, /fields\.map\(\(field\) => <div/);
  assert.match(editor, /values: submitted/);
});

test("first-time or revoked sender setup retains the required legacy phone ID", () => {
  assert.deepEqual(secretEditorFields(sender, false), sender.fields);
  const phone = sender.fields.find(({ name }) => name === "phoneNumberId")!;
  assert.equal(phone.kind, "string");
  assert.equal("optional" in phone && phone.optional, false);
});

test("all other configuration editors retain their complete field sets", () => {
  for (const contract of PLATFORM_SECRET_CONTRACTS.filter(({ key }) => key !== "messaging.sender")) {
    assert.deepEqual(secretEditorFields(contract, true), contract.fields);
    assert.deepEqual(secretEditorFields(contract, false), contract.fields);
  }
});
