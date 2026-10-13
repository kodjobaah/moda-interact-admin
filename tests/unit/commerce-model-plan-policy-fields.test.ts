import assert from "node:assert/strict";
import test from "node:test";
import { CommerceBudgetValidationError } from "../../src/lib/admin/commerce-model-policy-fields.ts";
import { parseLivePlanBudgetForm, readSparseCommerceBudget } from "../../src/lib/admin/commerce-model-plan-policy-fields.ts";

function form(fields: Record<string,string>): FormData {
  const result = new FormData();
  for (const [k,v] of Object.entries(fields)) result.set(k,v);
  return result;
}
const basic = { planId: "plan-one", expectedEditVersion: "0", reason: "Test plan override" };
test("Independent sparse overrides do not copy inherited Platform values", () => {
  assert.deepEqual(parseLivePlanBudgetForm(form({ ...basic, override_outputTokens: "on", outputTokens: "1200" })).budget, { outputTokens: 1200 });
  assert.deepEqual(parseLivePlanBudgetForm(form({ ...basic, override_deadlineMs: "on", deadlineMs: "90000" })).budget, { deadlineMs: 90000 });
  assert.deepEqual(parseLivePlanBudgetForm(form({ ...basic, deadlineMs: "60000", outputTokens: "800" })).budget, {});
});
test("A sparse v1 row rejects unknown keys, empty budgets, non-integers and null", () => {
  assert.deepEqual(readSparseCommerceBudget({ deadlineMs: 90000 }, 1), { deadlineMs: 90000 });
  for (const value of [ {}, { deadlineMs: null }, { deadlineMs: 1.2 }, { remoteCalls: 2 }, { outputTokens: -1 }, [] ]) {
    assert.throws(() => readSparseCommerceBudget(value,1));
  }
  assert.throws(() => readSparseCommerceBudget({ outputTokens: 800 }, 2));
});
test("A requested override must be a valid number with a supported deadline", () => {
  for (const token of ["0", "-1", "1.4", "", "Infinity", "9007199254740992"]) {
    assert.throws(() => parseLivePlanBudgetForm(form({ ...basic, override_outputTokens: "on", outputTokens: token })), (e) => e instanceof CommerceBudgetValidationError && !!e.fieldErrors.outputTokens);
  }
  assert.throws(() => parseLivePlanBudgetForm(form({ ...basic, override_deadlineMs: "on", deadlineMs: "90001" })), (e) => e instanceof CommerceBudgetValidationError && !!e.fieldErrors.deadlineMs);
  assert.throws(() => parseLivePlanBudgetForm(form({ ...basic, reason: "" })), (e) => e instanceof CommerceBudgetValidationError && !!e.fieldErrors.reason);
  assert.throws(() => parseLivePlanBudgetForm(form({ ...basic, expectedEditVersion: "-1" })), (e) => e instanceof CommerceBudgetValidationError && !!e.fieldErrors.expectedEditVersion);
});
