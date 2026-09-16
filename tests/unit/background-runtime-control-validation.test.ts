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
  assert.equal(keys.length, 41);
  assert.equal(new Set(keys).size, keys.length);
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
