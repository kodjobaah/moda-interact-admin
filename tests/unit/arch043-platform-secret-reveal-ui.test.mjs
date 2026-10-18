import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const load = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [editor, field, service, action, contracts] = await Promise.all([
  load("../../src/components/admin/platform-configuration/secret-configuration-editor.tsx"),
  load("../../src/components/admin/platform-configuration/configuration-field.tsx"),
  load("../../src/lib/admin/platform-configuration/secret-service.ts"),
  load("../../src/app/actions/platform-secret.ts"),
  load("../../src/lib/admin/platform-configuration/secrets-contracts.ts"),
]);
test("secret editor reveals stored fields on demand, masks values, and does not auto-load", () => {
  assert.match(editor, /revealPlatformSecretFieldAction/);
  assert.match(editor, /setRevealed/);
  assert.match(editor, /delete next\[name\]/);
  assert.match(editor, /onToggleSecretVisibility/);
  assert.match(field, /secretVisible \? "text" : "password"/);
  assert.match(field, /aria-pressed/);
  assert.doesNotMatch(editor, /useEffect\(/);
});
test("initial setup and policy edits have no manual audit reason; only Rotate/Revoke require choice", () => {
  assert.match(editor, /ROTATION_REASONS/);
  assert.match(editor, /REVOCATION_REASONS/);
  assert.doesNotMatch(editor, /SECRET_REASONS\.map/);
  assert.match(service, /"initial-setup"/);
  assert.match(service, /"configuration-update"/);
  assert.match(service, /"credential-compromise"/);
  assert.match(contracts, /"configuration-update"/);
});
test("read action is separately authorised and never serialises ciphertext or logs secret values", () => {
  assert.match(action, /revealPlatformSecretField\(input\)/);
  assert.match(service, /permitted\(deps\.principal\)/);
  assert.match(service, /unsealSecret\(/);
  assert.match(service, /secret_revealed/);
  assert.doesNotMatch(service, /logAdminSecurityEvent\([^)]*value:/);
  assert.match(service, /version: row\.version/);
});
