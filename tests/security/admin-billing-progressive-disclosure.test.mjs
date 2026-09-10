import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath) => readFile(path.join(repositoryRoot, relativePath), "utf8");

test("global billing exposes exactly five URL-backed views with overview fallback", async () => {
  const [page, tabs] = await Promise.all([
    read("src/app/(protected)/billing/page.tsx"),
    read("src/components/admin/billing-tabs.tsx"),
  ]);
  assert.match(page, /allowedViews: BillingView\[\] = \["overview", "plans", "packs", "events", "controls"\]/);
  assert.match(page, /rawView.*rawParams\.view/);
  assert.match(page, /: "overview"/);
  assert.match(tabs, /<Link/);
  assert.match(tabs, /aria-current/);
});

test("billing route loads only the selected view and selected detail", async () => {
  const page = await read("src/app/(protected)/billing/page.tsx");
  assert.doesNotMatch(page, /Promise\.all\(\[\s*getBillingPlans/);
  assert.match(page, /view === "overview" \? await getBillingOverview\(\)/);
  assert.match(page, /view === "plans" \? await getBillingPlans\(\)/);
  assert.match(page, /view === "packs"\s*\n\s*\? await getRecoveryCreditPurchases/);
  assert.match(page, /view === "events"\s*\n\s*\? await getBillingLedger/);
  assert.match(page, /view === "controls" \? await getPlatformBillingPolicy\(\)/);
  assert.match(page, /getBillingPlanById/);
  assert.match(page, /getRecoveryCreditPurchaseDetail/);
  assert.match(page, /getBillingLedgerItem/);
});

test("App Events filters preserve the events view and reset only event selection", async () => {
  const [overview, drawers] = await Promise.all([
    read("src/components/admin/billing-overview.tsx"),
    read("src/components/admin/billing-drawers.tsx"),
  ]);
  assert.match(overview, /<input type="hidden" name="view" value="events" \/>/);
  assert.match(overview, /pageParam="eventPage"/);
  assert.match(overview, /eventId: item\.id/);
  assert.match(drawers, /withParamUpdates\("\/billing", params, \{ eventId: null \}\)/);
});

test("recovery-pack receipt guidance distinguishes pending and submitted events", async () => {
  const drawers = await read("src/components/admin/billing-drawers.tsx");
  assert.match(drawers, /const eventReported = event\.shopifyReportState === "REPORTED"/);
  assert.match(drawers, /\{eventReported \? \(/);
  assert.match(drawers, /eventReported && purchase\.status === "PENDING_BILLING"/);
  assert.doesNotMatch(drawers, /\{purchase\.status === "PENDING_BILLING" \? \(/);
});

test("overview and plans use progressive disclosure", async () => {
  const [page, overview, catalogue] = await Promise.all([
    read("src/app/(protected)/billing/page.tsx"),
    read("src/components/admin/billing-overview.tsx"),
    read("src/components/admin/billing-plan-catalog.tsx"),
  ]);
  assert.match(page, /view === "overview" && overview/);
  assert.match(page, /view === "plans" && plans/);
  assert.doesNotMatch(overview, /providerResponseSummary.*<\/td>/s);
  assert.doesNotMatch(overview, /<BillingPlanCatalog/);
  assert.match(catalogue, /billing\.registerPlanAction/);
  assert.match(catalogue, /billing\.editPlanAction/);
  assert.match(catalogue, /billing\.recoveryCreditsPerPack/);
  assert.match(catalogue, /plan\.recoveryCreditsPerPack/);
  assert.doesNotMatch(catalogue, /<PlanForm plan=\{plan\}/);
});

test("pack and event detail reads remain protected and diagnostics are drawer-only", async () => {
  const [billing, drawers, events] = await Promise.all([
    read("src/lib/admin/billing.ts"),
    read("src/components/admin/billing-drawers.tsx"),
    read("src/components/admin/billing-overview.tsx"),
  ]);
  assert.match(billing, /export async function getRecoveryCreditPurchaseDetail/);
  assert.match(billing, /export async function getBillingLedgerItem/);
  assert.match(drawers, /getBillingLedgerItem|BillingEventDrawer/);
  for (const diagnostic of ["providerErrorCode", "providerResponseSummary", "reportAttemptCount", "lastReportAttemptAt", "shopifyEventHandle"]) {
    assert.match(drawers, new RegExp(diagnostic));
    assert.doesNotMatch(events, new RegExp(`${diagnostic}[^\\n]*<`));
  }
});

test("drawer links preserve active filters and close only their selection", async () => {
  const [tabs, packs, overview, drawers] = await Promise.all([
    read("src/components/admin/billing-tabs.tsx"),
    read("src/components/admin/billing-recovery-packs.tsx"),
    read("src/components/admin/billing-overview.tsx"),
    read("src/components/admin/billing-drawers.tsx"),
  ]);
  assert.match(tabs, /relevantParams/);
  assert.match(packs, /\.\.\.params.*purchaseId/);
  assert.match(overview, /\.\.\.params.*eventId/);
  assert.match(drawers, /withParamUpdates\("\/billing", params, \{ purchaseId: null \}\)/);
  assert.match(drawers, /withParamUpdates\("\/billing", params, \{ eventId: null \}\)/);
});

test("global billing visible labels use the translation catalogue", async () => {
  const [page, tabs, packs, drawers, catalogue] = await Promise.all([
    read("src/app/(protected)/billing/page.tsx"),
    read("src/components/admin/billing-tabs.tsx"),
    read("src/components/admin/billing-recovery-packs.tsx"),
    read("src/components/admin/billing-drawers.tsx"),
    read("src/i18n/locales/en.json"),
  ]);
  for (const key of ["billing.tabs", "billing.plansDescription", "billing.recoveryPacksDescription", "billing.allStatuses", "billing.createdAt", "billing.status"]) {
    assert.match(catalogue, new RegExp(`\\"${key}\\"`));
  }
  assert.doesNotMatch(`${page}\n${tabs}\n${packs}\n${drawers}`, />\s*(Overview|Plans|Recovery packs|App Events|Controls|Details|Status)\s*</);
});

test("controls remain isolated to the controls view and existing mutation security stays intact", async () => {
  const [page, controls, security] = await Promise.all([
    read("src/app/(protected)/billing/page.tsx"),
    read("src/components/admin/billing-controls.tsx"),
    read("tests/security/admin-billing-plan.test.mjs"),
  ]);
  assert.match(page, /view === "controls" && policy/);
  assert.match(page, /<PlatformBillingControls policy=\{policy\}/);
  assert.match(controls, /mutatePlatformBillingPolicyAction/);
  assert.match(security, /mutateBillingPlanAction|requirePlatformAdmin/);
});
