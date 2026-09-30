import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actionSource = await readFile(
  new URL("../../src/app/actions/agent-instructions.ts", import.meta.url),
  "utf8",
);
const consoleSource = await readFile(
  new URL("../../src/components/admin/agent-instructions/agent-instructions-console.tsx", import.meta.url),
  "utf8",
);

test("prompt validation precedes authentication and every mutation still requires SUPER_ADMIN before transaction", () => {
  const mutationIndex = actionSource.indexOf("mutationFromForm(formData)");
  const authIndex = actionSource.indexOf("await requirePlatformAdminMutation()");
  const roleIndex = actionSource.indexOf('principal.role !== "SUPER_ADMIN"');
  const transactionIndex = actionSource.indexOf("prisma.$transaction(");
  assert.ok(mutationIndex >= 0);
  assert.ok(mutationIndex < authIndex);
  assert.ok(authIndex >= 0);
  assert.ok(roleIndex > authIndex);
  assert.ok(transactionIndex > roleIndex);
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
  assert.match(actionSource, /const promptText = validatePromptText\(String\(formData\.get\("promptText"\) \?\? ""\)\)/);
  assert.match(actionSource, /expectedEditVersion: version\(formData, "expectedEditVersion"\)/);
  assert.match(actionSource, /mutateAgentInstructions\(transaction, mutation, principal\.id\)/);
  assert.match(actionSource, /validatePromptText\(String\(formData\.get\("promptText"\) \?\? ""\)\)/);
});

test("oversized prompt text is rejected before admin/database work and matches the editor limit", () => {
  assert.ok(actionSource.indexOf("const mutation = mutationFromForm(formData)") < actionSource.indexOf("await requirePlatformAdminMutation()"));
  assert.ok(actionSource.indexOf("const mutation = mutationFromForm(formData)") < actionSource.indexOf("prisma.$transaction("));
  assert.match(actionSource, /validatePromptText\(String\(formData\.get\("promptText"\) \?\? ""\)\)/);
  assert.match(consoleSource, /maxLength=\{32_000\}/);
});