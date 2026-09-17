import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath) => readFile(path.join(repositoryRoot, relativePath), "utf8");

test("global billing exposes URL-backed views with overview fallback", async () => {
  const [page, tabs] = await Promise.all([
    read("src/app/(protected)/billing/page.tsx"),
    read("src/components/admin/billing-tabs.tsx"),
  ]);
  assert.match(page, /allowedViews: BillingView\[\] = \[\s*"overview",\s*"plans",\s*"packs",\s*"refunds",\s*"events",\s*\]/);
  assert.match(page, /rawRequestedView = firstParam\(rawParams\.view\)/);
  assert.match(page, /rawRequestedView === "controls"/);
  assert.match(page, /: "overview"/);
  assert.match(tabs, /<Link/);
  assert.match(tabs, /aria-current/);
});

test("billing route loads only the selected view and selected detail", async () => {
  const page = await read("src/app/(protected)/billing/page.tsx");
  assert.doesNotMatch(page, /Promise\.all\(\[\s*getBillingPlans/);
  assert.match(page, /view === "overview" \? await getBillingOverview\(\)/);
  assert.match(
    page,
    /view === "plans"\s*\n\s*\? await getMerchantPricingPlans\(\{[\s\S]*planPage[\s\S]*planPageSize[\s\S]*\}\)/,
  );
  assert.match(page, /view === "packs"\s*\n\s*\? await getRecoveryCreditPurchases/);
  assert.match(page, /view === "events"\s*\n\s*\? await getBillingLedger/);
  assert.doesNotMatch(page, /view === "controls" \? await getPlatformBillingPolicy\(\)/);
  assert.match(page, /getMerchantPricingPlanById/);
  assert.match(page, /getRecoveryCreditPurchaseDetail/);
  assert.match(page, /getBillingLedgerItem/);
  assert.doesNotMatch(page, /getBillingPlans|getBillingPlanById|getBillingPlanEconomics|BillingPlanCatalog|BillingPlanDrawer/);
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
  const [page, overview, catalogue, drawers] = await Promise.all([
    read("src/app/(protected)/billing/page.tsx"),
    read("src/components/admin/billing-overview.tsx"),
    read("src/components/admin/merchant/merchant-pricing-plan-catalog.tsx"),
    read("src/components/admin/billing-drawers.tsx"),
  ]);
  assert.match(page, /view === "overview" && overview/);
  assert.match(page, /view === "plans" && plans/);
  assert.doesNotMatch(overview, /providerResponseSummary.*<\/td>/s);
  assert.doesNotMatch(overview, /<BillingPlanCatalog/);
  assert.match(
    page,
    /<MerchantPricingPlanCatalog plans=\{plans\} params=\{params\} \/>/,
  );
  assert.match(catalogue, /name="planPageSize"/);
  assert.match(catalogue, /pageParam="planPage"/);
  assert.match(catalogue, /MERCHANT_PRICING_CATALOGUE_PAGE_SIZES/);
  assert.match(drawers, /export function MerchantPricingPlanDrawer/);
  assert.match(catalogue, /mutateMerchantPricingPlanAction/);
  assert.match(catalogue, /drawer: "register-plan"/);
  assert.doesNotMatch(`${page}\n${drawers}`, /BillingPlanCatalog|BillingPlanDrawer/);
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

test("platform policy is isolated from Billing Plans and existing mutation security stays intact", async () => {
  const [billingPage, policyPage, controls, security] = await Promise.all([
    read("src/app/(protected)/billing/page.tsx"),
    read("src/app/(protected)/system-controls/platform-policy/page.tsx"),
    read("src/components/admin/billing-controls.tsx"),
    read("tests/security/admin-merchant-pricing-plan.test.mjs"),
  ]);
  assert.doesNotMatch(billingPage, /PlatformPolicyControls|view === "controls" && policy/);
  assert.match(billingPage, /redirect\("\/system-controls\/platform-policy"\)/);
  assert.match(policyPage, /<PlatformPolicyControls policy=\{policy\}/);
  assert.match(policyPage, /<AdminShell active="platform-policy">/);
  assert.match(controls, /mutatePlatformBillingPolicyAction/);
  assert.match(security, /mutateMerchantPricingPlanAction|requirePlatformAdmin/);
});
