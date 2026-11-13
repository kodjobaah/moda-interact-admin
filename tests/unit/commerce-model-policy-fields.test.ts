import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMERCE_MODEL_BUDGET_FIELDS,
  CommerceBudgetValidationError,
  canEditLiveCommerceBudget,
  parseLivePlatformBudgetForm,
  readCommerceModelBudget,
} from "../../src/lib/admin/commerce-model-policy-fields.ts";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const valid = { deadlineMs: "60000", outputTokens: "800", initialOutreachToolCalls: "16", expectedEditVersion: "1", reason: " Authorise budget " };

test("Platform policy editor includes the bounded initial outreach call budget", () => {
  assert.deepEqual(COMMERCE_MODEL_BUDGET_FIELDS.map(({ key }) => key), ["deadlineMs", "outputTokens", "initialOutreachToolCalls"]);
  assert.deepEqual(parseLivePlatformBudgetForm(form(valid)), {
    budget: { deadlineMs: 60000, outputTokens: 800, initialOutreachToolCalls: 16 }, expectedEditVersion: 1, reason: "Authorise budget",
  });
});

test("Field-level errors reject invalid numbers, unsupported deadline and empty reason", () => {
  for (const value of ["-1", "1.5", "", "9007199254740992", "Infinity", "0", "1e3"]) {
    assert.throws(() => parseLivePlatformBudgetForm(form({ ...valid, outputTokens: value })), (e) => e instanceof CommerceBudgetValidationError && Boolean(e.fieldErrors.outputTokens));
  }
  assert.throws(() => parseLivePlatformBudgetForm(form({ ...valid, deadlineMs: "90001" })), /Correct the highlighted/);
  assert.throws(() => parseLivePlatformBudgetForm(form({ ...valid, initialOutreachToolCalls: "65" })), /Correct the highlighted/);
  assert.throws(() => parseLivePlatformBudgetForm(form({ ...valid, reason: " " })), (e) => e instanceof CommerceBudgetValidationError && Boolean(e.fieldErrors.reason));
  assert.throws(() => parseLivePlatformBudgetForm(form({ ...valid, expectedEditVersion: "0" })), (e) => e instanceof CommerceBudgetValidationError && Boolean(e.fieldErrors.expectedEditVersion));
});

test("Read side fails closed for unsupported JSON keys, schema and missing values", () => {
  assert.deepEqual(readCommerceModelBudget({ deadlineMs: 60000, outputTokens: 800 }, 1), { deadlineMs: 60000, outputTokens: 800, initialOutreachToolCalls: 16 });
  assert.throws(() => readCommerceModelBudget({ deadlineMs: 60000 }, 1));
  assert.throws(() => readCommerceModelBudget({ deadlineMs: 60000, outputTokens: 800, remoteCalls: 5 }, 1));
  assert.throws(() => readCommerceModelBudget({ deadlineMs: 60000, outputTokens: 800 }, 2));
  assert.throws(() => readCommerceModelBudget({ deadlineMs: 60000, outputTokens: null }, 1));
});

test("LIVE policy writes only permit SUPER_ADMIN role", () => {
  assert.equal(canEditLiveCommerceBudget("SUPER_ADMIN"), true);
  for (const role of ["ADMIN", "SUPPORT", "MERCHANT", "", "super_admin"]) assert.equal(canEditLiveCommerceBudget(role), false);
});

test("a cached two-field Platform form is rejected rather than resetting the outreach budget", () => {
  const cachedForm = form(valid);
  cachedForm.delete("initialOutreachToolCalls");
  assert.throws(() => parseLivePlatformBudgetForm(cachedForm),
    (error) => error instanceof CommerceBudgetValidationError && Boolean(error.fieldErrors.initialOutreachToolCalls));
});

test("initial outreach calls accept only safe integers within the existing runtime range", () => {
  for (const value of [1, 64]) {
    assert.equal(parseLivePlatformBudgetForm(form({ ...valid, initialOutreachToolCalls: String(value) })).budget.initialOutreachToolCalls, value);
    assert.equal(readCommerceModelBudget({ deadlineMs: 60000, outputTokens: 800, initialOutreachToolCalls: value }, 1).initialOutreachToolCalls, value);
  }
  for (const value of ["0", "-1", "1.5", "65", "", "Infinity", "1e1", "9007199254740992"]) {
    assert.throws(() => parseLivePlatformBudgetForm(form({ ...valid, initialOutreachToolCalls: value })),
      (error) => error instanceof CommerceBudgetValidationError && Boolean(error.fieldErrors.initialOutreachToolCalls));
  }
  for (const value of [0, -1, 1.5, 65, null, "16", Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => readCommerceModelBudget({ deadlineMs: 60000, outputTokens: 800, initialOutreachToolCalls: value }, 1));
  }
});
