import assert from "node:assert/strict";
import test from "node:test";
import {
  derivePromotionCatalogueState,
  normalizePromotionTargetQuery,
  promotionCatalogueWhere,
  selectLastPromotionLifecycleChange,
} from "../../src/lib/admin/promotion-catalogue.ts";

const startsAt = new Date("2026-09-20T00:00:00.000Z");
const expiresAt = new Date("2026-10-01T00:00:00.000Z");
const now = new Date("2026-09-13T00:00:00.000Z");

test("derives all five catalogue states from status and the time window", () => {
  assert.equal(derivePromotionCatalogueState({ status: "DRAFT", startsAt, expiresAt }, now), "DRAFT");
  assert.equal(derivePromotionCatalogueState({ status: "ACTIVE", startsAt, expiresAt }, now), "SCHEDULED");
  assert.equal(derivePromotionCatalogueState({ status: "ACTIVE", startsAt: now, expiresAt }, now), "RUNNING");
  assert.equal(derivePromotionCatalogueState({ status: "ACTIVE", startsAt: new Date("2026-09-01T00:00:00.000Z"), expiresAt: now }, now), "EXPIRED");
  assert.equal(derivePromotionCatalogueState({ status: "CLOSED", startsAt, expiresAt }, now), "CLOSED");
});

test("projects visible target names and domains into a bounded case-insensitive query", () => {
  const where = promotionCatalogueWhere({ scope: "PLAN", target: `  ${"x".repeat(300)}  ` });
  assert.equal(where.scope, "PLAN");
  const nameFilter = where.OR?.[0];
  assert.ok(nameFilter && "name" in nameFilter);
  if (!nameFilter || !("name" in nameFilter)) throw new Error("Name filter missing.");
  const nameQuery = nameFilter.name;
  assert.ok(nameQuery);
  assert.equal(nameQuery.contains.length, 255);
  assert.deepEqual(where.OR?.slice(0, 3).map((entry) => Object.keys(entry)[0]), ["name", "targetPlan", "targetShop"]);
});

test("normalizes empty and whitespace target values", () => {
  assert.equal(normalizePromotionTargetQuery("  "), undefined);
  assert.equal(normalizePromotionTargetQuery(" plan-name "), "plan-name");
});

test("chooses EXPIRY_CHANGED after REOPENED when lifecycle timestamps tie", () => {
  const createdAt = new Date("2026-09-13T12:00:00.000Z");
  const last = selectLastPromotionLifecycleChange([
    { kind: "REOPENED", createdAt },
    { kind: "EXPIRY_CHANGED", createdAt },
  ]);
  assert.equal(last?.kind, "EXPIRY_CHANGED");
});