import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { loadPolicyModule } from "../unit/helpers/commerce-model-policy-module-harness.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const action = readFileSync(resolve(root, "src/app/actions/background-runtime-controls.ts"), "utf8");
const component = readFileSync(resolve(root, "src/components/admin/background-runtime-controls.tsx"), "utf8");
const validation = readFileSync(resolve(root, "src/lib/admin/background-runtime-control-validation.ts"), "utf8");
const page = readFileSync(resolve(root, "src/app/(protected)/system-controls/background-runtime/page.tsx"), "utf8");
const runtimeValidation = loadPolicyModule("src/lib/admin/background-runtime-control-validation.ts", {});

function actionFixture({ role = "SUPER_ADMIN", version = 7 } = {}) {
  const stored = {
    id: "default",
    version,
    ...Object.fromEntries(runtimeValidation.ALL_RUNTIME_FIELDS.map((field) => [field.key, field.defaultValue])),
  };
  const updates = [];
  const audits = [];
  const state = { transactions: 0, revalidated: 0 };
  const prisma = {
    async $transaction(callback) {
      state.transactions++;
      const staged = structuredClone(stored);
      const stagedAudits = [];
      const transaction = {
        backgroundRuntimeConfig: {
          async findUnique({ where }) {
            assert.deepEqual(where, { id: "default" });
            return structuredClone(staged);
          },
          async updateMany({ where, data }) {
            updates.push({ where, data });
            if (where.id !== staged.id || where.version !== staged.version) return { count: 0 };
            for (const [key, value] of Object.entries(data)) {
              if (key === "version") staged.version += value.increment;
              else staged[key] = value;
            }
            return { count: 1 };
          },
        },
        backgroundRuntimeConfigAuditEvent: {
          async create({ data }) {
            stagedAudits.push(data);
          },
        },
      };
      const result = await callback(transaction);
      Object.assign(stored, staged);
      audits.push(...stagedAudits);
      return result;
    },
  };
  const module = loadPolicyModule("src/app/actions/background-runtime-controls.ts", {
    "@prisma/client": { BackgroundRuntimeConfigSection: { OPERATIONAL: "OPERATIONAL" } },
    "next/cache": { revalidatePath: (path) => {
      assert.equal(path, "/system-controls/background-runtime");
      state.revalidated++;
    } },
    "@/lib/auth/platform-admin": {
      requirePlatformAdminMutation: async () => ({ id: "platform-admin-1", role, developmentBypass: false }),
      requirePlatformAdminRead: async () => ({ id: "platform-admin-1", role }),
    },
    "@/lib/prisma": { prisma },
    "@/lib/admin/background-runtime-control-validation": runtimeValidation,
  });
  const form = (overrides = {}) => {
    const data = new FormData();
    data.set("section", "OPERATIONAL");
    data.set("expectedVersion", String(version));
    data.set("reason", "Support requested a longer recovery window");
    for (const field of runtimeValidation.fieldsForSection("OPERATIONAL")) {
      const value = field.displayMultiplier ? stored[field.key] / field.displayMultiplier : stored[field.key];
      data.set(field.key, String(value));
    }
    for (const [key, value] of Object.entries(overrides)) data.set(key, value);
    return data;
  };
  const snapshot = (config) => Object.fromEntries([
    ["version", config.version],
    ...runtimeValidation.ALL_RUNTIME_FIELDS.map(({ key }) => [key, config[key]]),
  ]);
  return { action: module.mutateBackgroundRuntimeControlsAction, form, stored, updates, audits, state, snapshot };
}

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
  assert.match(validation, /"days", 0, null, 21/);
  assert.match(validation, /Zero expires eligible recoveries immediately; expired history remains\. Choose a non-negative whole number of days\./);
  assert.match(component, /defaults to 21 days/);
  assert.match(component, /max=\{field\.max === null \? undefined : field\.max/);
  assert.match(component, /Zero expires eligible recoveries immediately and may prevent recovery outreach\./);
  assert.match(component, /platform-wide control/);
  assert.match(component, /retains recovery, conversation, and message history/);
});

test("SUPER_ADMIN action persists the recovery lifetime and audits exact snapshots and reason", async () => {
  const fixture = actionFixture();
  const before = fixture.snapshot(fixture.stored);
  await fixture.action(fixture.form({ checkoutRecoveryLifetimeDays: "180" }));

  assert.equal(fixture.stored.checkoutRecoveryLifetimeDays, 180);
  assert.equal(fixture.stored.version, 8);
  assert.equal(fixture.updates.length, 1);
  assert.deepEqual(fixture.updates[0].where, { id: "default", version: 7 });
  assert.equal(fixture.updates[0].data.checkoutRecoveryLifetimeDays, 180);
  assert.equal(fixture.audits.length, 1);
  assert.deepEqual(fixture.audits[0], {
    configId: "default",
    section: "OPERATIONAL",
    expectedVersion: 7,
    resultingVersion: 8,
    platformAdminId: "platform-admin-1",
    reason: "Support requested a longer recovery window",
    beforeValue: before,
    afterValue: fixture.snapshot(fixture.stored),
  });
  assert.equal(fixture.audits[0].beforeValue.checkoutRecoveryLifetimeDays, 21);
  assert.equal(fixture.audits[0].afterValue.checkoutRecoveryLifetimeDays, 180);
  assert.deepEqual(fixture.state, { transactions: 1, revalidated: 1 });
});

test("action rejects non-admins, stale versions, and invalid lifetimes without mutation or audit", async () => {
  const unauthorized = actionFixture({ role: "ADMIN" });
  await assert.rejects(unauthorized.action(unauthorized.form({ checkoutRecoveryLifetimeDays: "180" })), /SUPER_ADMIN/);
  assert.equal(unauthorized.state.transactions, 0);

  const stale = actionFixture();
  await assert.rejects(stale.action(stale.form({ expectedVersion: "6" })), /changed since this page was loaded/);
  assert.equal(stale.updates.length, 0);
  assert.equal(stale.audits.length, 0);
  assert.equal(stale.stored.checkoutRecoveryLifetimeDays, 21);

  const invalid = actionFixture();
  await assert.rejects(invalid.action(invalid.form({ checkoutRecoveryLifetimeDays: "-1" })), /whole number|at least 0/);
  assert.equal(invalid.updates.length, 0);
  assert.equal(invalid.audits.length, 0);
  assert.equal(invalid.stored.checkoutRecoveryLifetimeDays, 21);
  assert.equal(invalid.stored.version, 7);
  assert.equal(invalid.state.revalidated, 0);
});

test("documents expired promotion cleanup on the existing reconciliation controls", () => {
  assert.match(validation, /Reconciliation interval/);
  assert.match(validation, /expired promotion cleanup/);
  assert.doesNotMatch(action, /promotionReconciliationIntervalSeconds|promotionReconciliationBatchSize/);
  assert.doesNotMatch(validation, /promotionReconciliationIntervalSeconds|promotionReconciliationBatchSize/);
  assert.doesNotMatch(component, /promotionReconciliationIntervalSeconds|promotionReconciliationBatchSize/);
});
