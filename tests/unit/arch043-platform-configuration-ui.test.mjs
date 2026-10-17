import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const read = async (path) => readFile(new URL(path, import.meta.url), "utf8");
const [editor, fields, navigation, page, serverAction, service, repo] = await Promise.all([
  read("../../src/components/admin/platform-configuration/configuration-editor.tsx"),
  read("../../src/components/admin/platform-configuration/configuration-field.tsx"),
  read("../../src/components/admin/platform-configuration/configuration-navigation.tsx"),
  read("../../src/app/(protected)/system-controls/platform-configuration/page.tsx"),
  read("../../src/app/actions/platform-configuration.ts"),
  read("../../src/lib/admin/platform-configuration/service.ts"),
  read("../../src/lib/admin/platform-configuration/repository.ts"),
]);
test("same generic editor and controls used for all registry-driven keys", () => {
  assert.match(page, /data\.contracts\.find/);
  assert.match(page, /<ConfigurationNavigation contracts=\{data\.contracts\}/);
  assert.match(page, /<ConfigurationEditor key=/);
  assert.match(editor, /contract\.fields\.map/);
  assert.match(navigation, /contracts\.map/);
  assert.match(fields, /field\.kind === "integer"/);
  assert.match(fields, /field\.kind === "boolean"/);
  assert.match(fields, /field\.kind === "enum"/);
  assert.match(fields, /field\.kind === "secret"/);
  assert.match(fields, /type="password"/);
});
test("safe Save/Reset/Refresh, reason, conflicts, duplicate prevention and accessibility", () => {
  assert.match(editor, /processing\.current/);
  assert.match(editor, /window\.confirm/);
  assert.match(editor, /type="button" onClick=\{refresh\}/);
  assert.match(editor, /contract\.canReset/);
  assert.match(editor, /snapshot\.version/);
  assert.match(editor, /result\.code === "CONFLICT"/);
  assert.match(fields, /aria-describedby/);
  assert.match(fields, /aria-invalid/);
  assert.match(page, /ConfigurationHistoryPanel/);
});
test("one authenticated action, no caller-controlled environment, transactionally audited", () => {
  assert.match(serverAction, /updatePlatformConfiguration\(input\)/);
  assert.match(serverAction, /resetPlatformConfiguration\(input\)/);
  assert.match(service, /requirePlatformAdminMutation\(\)/);
  assert.match(service, /getConfigurationEnvironment\(\)/);
  assert.match(repo, /TransactionIsolationLevel\.Serializable/);
  assert.match(repo, /platformConfiguration\.updateMany/);
  assert.match(repo, /platformConfigurationAudit\.create/);
  assert.doesNotMatch(editor, /setInterval|useEffect/);
});
