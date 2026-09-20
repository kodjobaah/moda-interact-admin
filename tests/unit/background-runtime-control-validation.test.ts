import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALL_RUNTIME_FIELDS,
  parseRuntimeControlsForm,
  runtimeControlsSuccessMessage,
  validateRuntimeConfig,
} from "../../src/lib/admin/background-runtime-control-validation.ts";

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

test("validates checkout recovery lifetime as whole days from 1 through 90", () => {
  const current = Object.fromEntries(ALL_RUNTIME_FIELDS.map((field) => [field.key, field.defaultValue]));
  const form = new FormData();
  for (const field of ALL_RUNTIME_FIELDS) {
    const displayValue = field.displayMultiplier ? current[field.key] / field.displayMultiplier : current[field.key];
    form.set(field.key, String(displayValue));
  }

  assert.equal(current.checkoutRecoveryLifetimeDays, 21);
  for (const value of ["1", "90"]) {
    form.set("checkoutRecoveryLifetimeDays", value);
    assert.equal(parseRuntimeControlsForm(form, "OPERATIONAL", current).checkoutRecoveryLifetimeDays, Number(value));
  }
  for (const value of ["0", "91", "1.5", "21.0"]) {
    form.set("checkoutRecoveryLifetimeDays", value);
    assert.throws(() => parseRuntimeControlsForm(form, "OPERATIONAL", current));
  }
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
