import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePromotionReportPage,
  normalizePromotionReportSearch,
  projectPromotionMerchantRow,
} from "../../src/lib/admin/promotion-report-model.ts";

const selectedAt = new Date("2026-01-01T00:00:00Z");
const reselectedAt = new Date("2026-01-03T00:00:00Z");
const usedAt = new Date("2026-01-02T00:00:00Z");

function grant(overrides: Partial<Parameters<typeof projectPromotionMerchantRow>[0]> = {}) {
  return projectPromotionMerchantRow({
    shopId: "shop-1",
    shopLabel: "shop.example",
    quantity: 10,
    reservedQuantity: 2,
    committedQuantity: 3,
    firstSelectedAt: selectedAt,
    lastSelectedAt: reselectedAt,
    selectionCount: 2,
    firstUsedAt: null,
    lastUsedAt: null,
    exhaustedAt: null,
    selection: { id: "selection-1" },
    ...overrides,
  });
}

test("selected-but-unused grants preserve selection history and remain distinct from used grants", () => {
  const selected = grant();
  const used = grant({ firstUsedAt: usedAt, lastUsedAt: reselectedAt });
  assert.equal(selected.firstSelectedAt, selectedAt);
  assert.equal(selected.firstUsedAt, null);
  assert.equal(selected.lastUsedAt, null);
  assert.notEqual(used.firstUsedAt, null);
});

test("used grants preserve first and last use timestamps independently", () => {
  const row = grant({ firstUsedAt: usedAt, lastUsedAt: reselectedAt });
  assert.equal(row.firstSelectedAt, selectedAt);
  assert.equal(row.lastSelectedAt, reselectedAt);
  assert.equal(row.firstUsedAt, usedAt);
  assert.equal(row.lastUsedAt, reselectedAt);
});

test("remaining allocation is quantity minus reserved and committed, bounded at zero", () => {
  assert.equal(grant().remainingAllocation, 5);
  assert.equal(grant({ quantity: 4, reservedQuantity: 3, committedQuantity: 4 }).remainingAllocation, 0);
});

test("reselection preserves one original allocation and its history", () => {
  const row = grant({ quantity: 10, selectionCount: 3 });
  assert.equal(row.quantityGranted, 10);
  assert.equal(row.selectionCount, 3);
  assert.equal(row.firstSelectedAt, selectedAt);
  assert.equal(row.lastSelectedAt, reselectedAt);
});

test("exhaustion and current-selection projection are preserved", () => {
  const exhaustedAt = new Date("2026-01-04T00:00:00Z");
  assert.equal(grant({ exhaustedAt }).exhaustedAt, exhaustedAt);
  assert.equal(grant({ selection: { id: "current" } }).currentlySelected, true);
  assert.equal(grant({ selection: null }).currentlySelected, false);
});

test("page normalization accepts positive integers only", () => {
  for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
    assert.equal(normalizePromotionReportPage(value), 1);
  }
  assert.equal(normalizePromotionReportPage(3), 3);
});

test("merchant search is trimmed and truncated to 255 characters", () => {
  assert.equal(normalizePromotionReportSearch("  shop.example  "), "shop.example");
  assert.equal(normalizePromotionReportSearch("x".repeat(300))?.length, 255);
  assert.equal(normalizePromotionReportSearch("   "), undefined);
});