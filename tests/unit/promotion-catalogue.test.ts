import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import {
  derivePromotionCatalogueState,
  normalizePromotionTargetQuery,
  parsePromotionCataloguePageSize,
  promotionCatalogueWhere,
  selectLastPromotionLifecycleChange,
} from "../../src/lib/admin/promotions/catalogue.ts";

const startsAt = new Date("2026-09-20T00:00:00.000Z");
const expiresAt = new Date("2026-10-01T00:00:00.000Z");
const now = new Date("2026-09-13T00:00:00.000Z");

function andClauses(
  where: Prisma.PromotionCampaignWhereInput,
): Prisma.PromotionCampaignWhereInput[] {
  if (!where.AND) return [];
  return Array.isArray(where.AND) ? where.AND : [where.AND];
}

test("derives all five catalogue states from status and the time window", () => {
  assert.equal(derivePromotionCatalogueState({ status: "DRAFT", startsAt, expiresAt }, now), "DRAFT");
  assert.equal(derivePromotionCatalogueState({ status: "ACTIVE", startsAt, expiresAt }, now), "SCHEDULED");
  assert.equal(derivePromotionCatalogueState({ status: "ACTIVE", startsAt: now, expiresAt }, now), "RUNNING");
  assert.equal(derivePromotionCatalogueState({ status: "ACTIVE", startsAt: new Date("2026-09-01T00:00:00.000Z"), expiresAt: now }, now), "EXPIRED");
  assert.equal(derivePromotionCatalogueState({ status: "CLOSED", startsAt, expiresAt }, now), "CLOSED");
});

test("projects visible target names and domains into a bounded case-insensitive query", () => {
  const where = promotionCatalogueWhere({ scope: "PLAN", target: " Growth " }, now);
  const clauses = andClauses(where);
  assert.deepEqual(clauses[0], { scope: "PLAN" });
  const search = clauses[1];
  assert.ok(search && "OR" in search);
  if (!search || !("OR" in search)) throw new Error("Search filter missing.");
  assert.deepEqual(search.OR?.slice(0, 3), [
    { name: { contains: "Growth", mode: "insensitive" } },
    { targetPlan: { name: { contains: "Growth", mode: "insensitive" } } },
    { targetShop: { domain: { contains: "Growth", mode: "insensitive" } } },
  ]);
});

test("bounds target input server-side while preserving exact scope filtering", () => {
  const where = promotionCatalogueWhere({ scope: "SHOP", target: `  ${"x".repeat(300)}  ` }, now);
  const clauses = andClauses(where);
  assert.deepEqual(clauses[0], { scope: "SHOP" });
  const search = clauses[1];
  assert.ok(search && "OR" in search);
  if (!search || !("OR" in search)) throw new Error("Search filter missing.");
  const nameFilter = search.OR?.[0];
  assert.deepEqual(nameFilter, {
    name: { contains: "x".repeat(255), mode: "insensitive" },
  });
});

test("state filters are projected into the database query before pagination", () => {
  assert.deepEqual(promotionCatalogueWhere({ state: "DRAFT" }, now), {
    AND: [{ status: "DRAFT" }],
  });
  assert.deepEqual(promotionCatalogueWhere({ state: "RUNNING" }, now), {
    AND: [
      {
        status: "ACTIVE",
        startsAt: { lte: now },
        expiresAt: { gt: now },
      },
    ],
  });
});

test("catalogue page size accepts only the supported options", () => {
  assert.equal(parsePromotionCataloguePageSize(undefined), 5);
  assert.equal(parsePromotionCataloguePageSize("10"), 10);
  assert.equal(parsePromotionCataloguePageSize("50"), 50);
  assert.equal(parsePromotionCataloguePageSize("999"), 5);
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
