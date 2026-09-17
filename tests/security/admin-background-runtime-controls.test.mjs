import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const action = readFileSync(resolve(root, "src/app/actions/background-runtime-controls.ts"), "utf8");
const component = readFileSync(resolve(root, "src/components/admin/background-runtime-controls.tsx"), "utf8");
const validation = readFileSync(resolve(root, "src/lib/admin/background-runtime-control-validation.ts"), "utf8");
const page = readFileSync(resolve(root, "src/app/(protected)/system-controls/background-runtime/page.tsx"), "utf8");

test("runtime mutations are SUPER_ADMIN-only and version fenced", () => {
  assert.match(action, /requirePlatformAdminMutation/);
  assert.match(action, /principal\.role !== "SUPER_ADMIN"/);
  assert.match(action, /where: \{ id: "default", version: expectedVersion \}/);
  assert.match(action, /backgroundRuntimeConfig\.updateMany/);
  assert.match(action, /backgroundRuntimeConfigAuditEvent\.create/);
  assert.doesNotMatch(action, /backgroundRuntimeConfig\.upsert/);
  assert.match(action, /RUNTIME_CONFLICT_MESSAGE/);
  assert.match(action, /RUNTIME_MISSING_MESSAGE/);
});

test("background runtime controls remain readable for non-super admins and expose no legacy economics", () => {
  assert.match(action, /requirePlatformAdminRead/);
  assert.match(component, /canMutate/);
  assert.match(component, /Operational/);
  assert.match(component, /Advanced/);
  assert.match(component, /Abuse Protection/);
  assert.match(component, /System-managed settings/);
  assert.match(component, /fleet-wide/);
  assert.match(page, /<AdminShell active="background-runtime">/);
  assert.doesNotMatch(page, /Upgrade ladder|Verified Shopify/);
});

test("scopes fleet-wide copy to Worker throughput and queue saves", () => {
  const queueIntro = "These values are fleet-wide queue limits across all worker replicas. Adding replicas does not multiply the configured cap.";
  const convergence = "Fleet-wide queue limits converge without redeploying workers.";
  assert.match(component, /title === "Worker throughput"/);
  assert.equal(component.includes(queueIntro), true);
  assert.equal(validation.includes(convergence), true);
  assert.match(component, /changedQueueConcurrency/);
  assert.equal(component.includes('section === "ADVANCED" ? (\n        <p'), false);
});

test("abuse windows are copy, not editable fields", () => {
  assert.match(component, /Window lengths are fixed by the application/);
  assert.match(validation, /Sender limit — 1 minute/);
  assert.match(validation, /Sender limit — 10 minutes/);
  assert.doesNotMatch(component, /windowLength|redisKey/);
});

test("checkout recovery lifetime is an audited operational control", () => {
  assert.match(validation, /checkoutRecoveryLifetimeDays/);
  assert.match(validation, /Checkout recovery lifetime/);
  assert.match(validation, /days.*1, 90, 21/);
  assert.match(action, /"checkoutRecoveryLifetimeDays"/);
  assert.match(action, /expectedVersion/);
  assert.match(action, /reason/);
  assert.match(action, /beforeValue/);
  assert.match(action, /afterValue/);
  assert.doesNotMatch(action, /checkoutRecovery\.(update|updateMany|delete|deleteMany)/);
  assert.match(component, /defaults to 21 days/);
  assert.match(component, /platform-wide control/);
  assert.match(component, /retains recovery, conversation, and message history/);
});
