import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actionSource = await readFile(
  new URL("../../src/app/actions/agent-instructions.ts", import.meta.url),
  "utf8",
);

test("every prompt mutation requires platform-admin authentication and SUPER_ADMIN before transaction", () => {
  const authIndex = actionSource.indexOf("await requirePlatformAdminMutation()");
  const roleIndex = actionSource.indexOf('principal.role !== "SUPER_ADMIN"');
  const mutationIndex = actionSource.indexOf("mutationFromForm(formData)");
  const transactionIndex = actionSource.indexOf("prisma.$transaction(");
  assert.ok(authIndex >= 0);
  assert.ok(roleIndex > authIndex);
  assert.ok(mutationIndex > roleIndex);
  assert.ok(transactionIndex > mutationIndex);
  assert.match(actionSource, /ensureDevelopmentPlatformAdmin\(transaction, principal\)/);
  assert.match(actionSource, /isolationLevel: "Serializable"/);
});

test("mutation parser bounds reasons and versions and supports only explicit lifecycle intents", () => {
  assert.match(actionSource, /const reason = text\(formData, "reason", 1000\)/);
  assert.match(actionSource, /Number\.isSafeInteger\(value\) \|\| value < 1/);
  for (const intent of ["create-draft", "update-draft", "publish", "activate"]) {
    assert.match(actionSource, new RegExp(`intent === "${intent}"`));
  }
  assert.match(actionSource, /Unsupported Agent Instructions action/);
});

test("the only prompt text mutation is the bounded CAS draft update", () => {
  assert.match(actionSource, /promptText: String\(formData\.get\("promptText"\) \?\? ""\)/);
  assert.match(actionSource, /expectedEditVersion: version\(formData, "expectedEditVersion"\)/);
  assert.match(actionSource, /mutateAgentInstructions\(transaction, mutation, principal\.id\)/);
});