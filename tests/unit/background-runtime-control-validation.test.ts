import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALL_RUNTIME_FIELDS,
  parseRuntimeControlsForm,
  runtimeFieldDisplayRange,
  runtimeControlsSuccessMessage,
  validateRuntimeConfig,
} from "../../src/lib/admin/background-runtime-control-validation.ts";
import { readFileSync } from "node:fs";

const componentSource = readFileSync(new URL("../../src/components/admin/background-runtime-controls.tsx", import.meta.url), "utf8");

test("covers every DATABASE-004 editable field exactly once", () => {
  const keys = ALL_RUNTIME_FIELDS.map((field) => field.key);
  assert.equal(keys.length, 42);
  assert.equal(new Set(keys).size, keys.length);
});

test("describes billing reconciliation as including expired promotion cleanup", () => {
  const interval = ALL_RUNTIME_FIELDS.find((field) => field.key === "billingReconciliationIntervalSeconds");
  const batch = ALL_RUNTIME_FIELDS.find((field) => field.key === "billingReconciliationShopBatchSize");

  assert.deepEqual(interval, {
    key: "billingReconciliationIntervalSeconds",
    label: "Reconciliation interval",
    guidance: "How often Moda performs periodic billing and entitlement reconciliation, including Shopify billing checks and expired promotion cleanup.",
    unit: "seconds",
    min: 10,
    max: 3600,
    defaultValue: 60,
  });
  assert.deepEqual(batch, {
    key: "billingReconciliationShopBatchSize",
    label: "Shops per reconciliation cycle",
    guidance: "Maximum merchants processed during one periodic billing and entitlement reconciliation pass, including expired promotion cleanup. Increase this as the merchant base grows, while watching provider and database load.",
    unit: "shops",
    min: 1,
    max: 200,
    defaultValue: 50,
  });
});

test("validates non-negative whole-day checkout recovery lifetimes without a policy maximum", () => {
  const current = Object.fromEntries(ALL_RUNTIME_FIELDS.map((field) => [field.key, field.defaultValue]));
  const original = { ...current };
  const form = new FormData();
  for (const field of ALL_RUNTIME_FIELDS) {
    const displayValue = field.displayMultiplier ? current[field.key] / field.displayMultiplier : current[field.key];
    form.set(field.key, String(displayValue));
  }

  assert.equal(current.checkoutRecoveryLifetimeDays, 21);
  const lifetime = ALL_RUNTIME_FIELDS.find((field) => field.key === "checkoutRecoveryLifetimeDays");
  assert.deepEqual(lifetime && { min: lifetime.min, max: lifetime.max, defaultValue: lifetime.defaultValue }, {
    min: 0,
    max: null,
    defaultValue: 21,
  });
  assert.equal(
    lifetime?.guidance,
    "Expire an active checkout recovery after this many days without checkout/customer activity. Zero expires eligible recoveries immediately; expired history remains. Choose a non-negative whole number of days.",
  );
  assert.equal(runtimeFieldDisplayRange(lifetime!), "0 or more whole days");

  for (const value of ["0", "1", "21", "90", "91", "180", "365", "2147483647"]) {
    form.set("checkoutRecoveryLifetimeDays", value);
    assert.equal(parseRuntimeControlsForm(form, "OPERATIONAL", current).checkoutRecoveryLifetimeDays, Number(value));
  }
  for (const value of ["-1", "1.5", "21.0", "", "1e2", "Infinity", "NaN", "9007199254740992"]) {
    form.set("checkoutRecoveryLifetimeDays", value);
    assert.throws(() => parseRuntimeControlsForm(form, "OPERATIONAL", current));
    assert.deepEqual(current, original);
  }
});

test("keeps existing bounds and renders an unbounded HTML input only for recovery lifetime", () => {
  const fields = new Map(ALL_RUNTIME_FIELDS.map((field) => [field.key, field]));
  assert.deepEqual(
    ["checkoutRecoveryLifetimeDays", "recoveryResumeBatchSize", "translationMaxAutoRetries"].map((key) => {
      const field = fields.get(key)!;
      return [field.key, field.min, field.max];
    }),
    [
      ["checkoutRecoveryLifetimeDays", 0, null],
      ["recoveryResumeBatchSize", 1, 100],
      ["translationMaxAutoRetries", 0, 10],
    ],
  );
  assert.match(componentSource, /type="number"[\s\S]*?min=\{field\.min \/ \(field\.displayMultiplier \?\? 1\)\}[\s\S]*?max=\{field\.max === null \? undefined : field\.max \/ \(field\.displayMultiplier \?\? 1\)\}[\s\S]*?step=\{runtimeFieldInputStep\(field\)\}/);
  assert.match(componentSource, /Zero expires eligible recoveries immediately and may prevent recovery outreach\./);
});

test("converts human seconds to exact milliseconds and enforces ranges", () => {
  const current = Object.fromEntries(ALL_RUNTIME_FIELDS.map((field) => [field.key, field.defaultValue]));
  const form = new FormData();
  for (const field of ALL_RUNTIME_FIELDS) form.set(field.key, String(current[field.key]));
  form.set("conversationQuietWindowMs", "2.5");
  form.set("conversationMaxSettleWindowMs", "10");
  const next = parseRuntimeControlsForm(form, "OPERATIONAL", current);
  assert.equal(next.conversationQuietWindowMs, 2500);
  assert.equal(next.conversationMaxSettleWindowMs, 10000);

  form.set("conversationQuietWindowMs", "0.249");
  assert.throws(
    () => parseRuntimeControlsForm(form, "OPERATIONAL", current),
    /Wait after customer message must be between 0\.25 and 10 seconds\./,
  );
  form.set("conversationQuietWindowMs", "2.5");
  form.set("conversationMaxSettleWindowMs", "30.001");
  assert.throws(
    () => parseRuntimeControlsForm(form, "OPERATIONAL", current),
    /Maximum message settle time must be between 1 and 30 seconds\./,
  );
});

test("enforces cross-field abuse and retry relationships", () => {
  const values = Object.fromEntries(ALL_RUNTIME_FIELDS.map((field) => [field.key, field.defaultValue]));
  values.rawGlobalLimitPerMinute = values.rawSenderLimitPerMinute - 1;
  assert.throws(() => validateRuntimeConfig(values), /global limit/i);
  values.rawGlobalLimitPerMinute = 20000;
  values.discoverySenderLimitPerMinute = values.turnSenderLimitPerMinute + 1;
  values.discoverySenderLimitPerTenMinutes = values.discoverySenderLimitPerMinute;
  assert.throws(() => validateRuntimeConfig(values), /product-discovery|conversation-turn/i);
});

test("requires a reason with the database audit bound", async () => {
  const source = await import("../../src/lib/admin/background-runtime-control-validation.ts");
  assert.throws(() => source.parseReason(new FormData().get("reason")), /reason/i);
  assert.throws(() => source.parseReason("x".repeat(1001)), /1000/);
});

test("adds convergence copy only when queue concurrency changed", () => {
  const queueMessage = runtimeControlsSuccessMessage(true);
  const nonQueueMessage = runtimeControlsSuccessMessage(false);
  assert.match(queueMessage, /Fleet-wide queue limits converge without redeploying workers\./);
  assert.doesNotMatch(nonQueueMessage, /Fleet-wide queue limits converge without redeploying workers\./);
  assert.match(nonQueueMessage, /Runtime controls updated\. The committed values are shared by all worker replicas\./);
});
