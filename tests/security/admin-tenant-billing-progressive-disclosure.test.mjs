import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => readFile(path.join(root, file), "utf8");

test("tenant billing exposes exactly four URL-backed sub-tabs", async () => {
  const [page, panel, billing] = await Promise.all([
    read("src/app/(protected)/page.tsx"),
    read("src/components/admin/tenant-detail-panel.tsx"),
    read("src/components/admin/tenant-billing.tsx"),
  ]);
  assert.match(page, /billingViews = \["overview", "usage", "shopify", "activity"\]/);
  assert.match(page, /rawBillingView/);
  assert.match(page, /: "overview"/);
  assert.match(panel, /billingView: "overview"/);
  assert.match(billing, /aria-current=\{view === value \? "page" : undefined\}/);
  assert.match(billing, /billing\.tab\.usage/);
  assert.match(billing, /billing\.tab\.shopify/);
  assert.match(billing, /billing\.tab\.activity/);
});

test("tenant activity is loaded on demand and detail reads are tenant scoped", async () => {
  const [page, billing] = await Promise.all([
    read("src/app/(protected)/page.tsx"),
    read("src/lib/admin/billing.ts"),
  ]);
  assert.match(page, /billingView === "activity"/);
  assert.match(page, /getRecoveryCreditPurchases\(\{[\s\S]*shopId: selectedTenant\.id/);
  assert.match(page, /getBillingLedger\(\{[\s\S]*shopId: selectedTenant\.id/);
  assert.match(page, /getRecoveryCreditPurchaseDetail\(purchaseId, selectedTenant\.id\)/);
  assert.match(page, /getBillingLedgerItem\(eventId, selectedTenant\.id\)/);
  assert.match(billing, /includeLedger = true/);
  assert.match(billing, /includeLedger\n\s*\?/);
  for (const helper of ["getRecoveryCreditPurchaseDetail", "getBillingLedgerItem"]) {
    const start = billing.indexOf(`export async function ${helper}`);
    const end = billing.indexOf("\nexport async function ", start + 1);
    assert.match(billing.slice(start, end === -1 ? undefined : end), /shopId \? \{ shopId \}/);
  }
});

test("tenant activity keeps primary columns compact and reuses accepted drawers", async () => {
  const [tenant, drawers] = await Promise.all([
    read("src/components/admin/tenant-billing.tsx"),
    read("src/components/admin/billing-drawers.tsx"),
  ]);
  for (const diagnostic of ["providerErrorCode", "providerResponseSummary", "reportAttemptCount", "shopifyEventHandle"]) {
    assert.doesNotMatch(tenant, new RegExp(diagnostic));
    assert.match(drawers, new RegExp(diagnostic));
  }
  assert.match(tenant, /RecoveryCreditPurchaseDrawer/);
  assert.match(tenant, /BillingEventDrawer/);
  assert.match(tenant, /<details/);
  assert.match(tenant, /billing\.reconciliationUnavailableShort/);
});

test("tenant detail drawers return to the tenant route", async () => {
  const drawers = await read("src/components/admin/billing-drawers.tsx");
  assert.match(drawers, /returnPath\?: string/);
  assert.match(drawers, /withParamUpdates\(returnPath, params, \{ purchaseId: null \}\)/);
  assert.match(drawers, /withParamUpdates\(returnPath, params, \{ eventId: null \}\)/);
});
