import assert from "node:assert/strict";
import test from "node:test";
import { parseLiveShopBudgetForm } from "../../src/lib/admin/commerce-model-shop-policy-fields.ts";

const makeForm = (fields: Record<string, string>) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
};
const common = { shopId: "shop-1", expectedEditVersion: "0", reason: "Merchant-specific budget" };

test("omitted override flags leave both fields inherited", () => {
  assert.deepEqual(parseLiveShopBudgetForm(makeForm({ ...common }), "shop-1").budget, {});
});
test("either field may override independently and other input values are ignored", () => {
  const value = parseLiveShopBudgetForm(makeForm({ ...common,
    override_outputTokens: "on", outputTokens: "1200", deadlineMs: "90000" }), "shop-1");
  assert.deepEqual(value.budget, { outputTokens: 1200 });
  assert.equal(value.shopId, "shop-1");
});
test("invalid tokens, deadlines and audit reasons are rejected", () => {
  const invalidCases: Record<string, string>[] = [
    { override_deadlineMs: "on", deadlineMs: "90001" },
    { override_outputTokens: "on", outputTokens: "0" },
    { override_outputTokens: "on", outputTokens: "3.5" },
    { reason: " " },
    { expectedEditVersion: "-1" },
  ];
  for (const fields of invalidCases) {
    assert.throws(() => parseLiveShopBudgetForm(makeForm({ ...common, ...fields }), "shop-1"));
  }
});
test("tenant identity must be present; policy cannot accept a missing Shop id", () => {
  assert.throws(() => parseLiveShopBudgetForm(makeForm({ ...common, shopId: "" }), "shop-1"), /scope does not match/);
});

test("another valid Shop ID is rejected against the trusted selection", () => {
  assert.throws(() => parseLiveShopBudgetForm(makeForm({ ...common, shopId: "shop-2" }), "shop-1"), /scope does not match/);
});
