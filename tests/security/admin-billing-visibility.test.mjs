import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";
import {
  billingDateBoundary,
  billingOverrideState,
  effectiveOutboundHardCap,
  localizedReportStateLabel,
  recoveryCreditPurchaseStatusLabel,
  tenantBillingLedgerPresentation,
} from "../../src/lib/admin/billing-presentation.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

test("billing reads stay platform-admin protected and tenant scoped", async () => {
  const source = await readFile(
    path.join(repositoryRoot, "src/lib/admin/billing.ts"),
    "utf8",
  );

  assert.equal((source.match(/requirePlatformAdminRead\(\)/g) ?? []).length, 6);
  assert.match(source, /shopId: input\.shopId/);
  assert.match(source, /shopId,/);
  assert.match(source, /metric: UsageMetric\.RECOVERY_CONVERSATION/);
  assert.match(source, /take: pageSize/);
  assert.match(source, /getRecoveryCreditPurchases/);
  assert.match(source, /getRecoveryCreditPurchaseDetail/);
  assert.match(source, /getBillingLedgerItem/);
  assert.match(source, /MAX_PAGE_SIZE = 50/);
  assert.match(source, /input\.pageSize \?\? 20/);
  assert.match(source, /createdAt: "desc"/);
  assert.match(source, /RecoveryCreditPurchaseStatus/);
  const detailHelper = (name) => {
    const start = source.indexOf(`export async function ${name}`);
    const end = source.indexOf("\nexport async function ", start + 1);
    return source.slice(start, end === -1 ? undefined : end);
  };
  for (const helper of [
    "getRecoveryCreditPurchaseDetail",
    "getBillingLedgerItem",
  ]) {
    const detailSource = detailHelper(helper);
    assert.match(detailSource, /where: \{ id, \.\.\.\(shopId \? \{ shopId \} : \{\}\) \}/);
  }
  assert.match(source, /providerResponseSummary: row\.usageEvent\.providerResponseSummary\?\.slice\(0, 2000\)/);
  assert.match(source, /providerErrorCode: true/);
  assert.doesNotMatch(
    source,
    /providerAccessToken|providerSecret|accessToken|apiKey/,
  );
  assert.match(source, /discrepancy: null/);
});

test("ARCH-008 catalogue uses the normative asynchronous billing copy", async () => {
  const catalogue = JSON.parse(
    await readFile(path.join(repositoryRoot, "src/i18n/locales/en.json"), "utf8"),
  );
  assert.deepEqual(
    Object.fromEntries(
      [
        "billing.tab.appEvents",
        "billing.state.REPORTED",
        "billing.submittedAt",
        "billing.asyncReceiptHelp",
        "billing.devDashboardHelp",
        "billing.packStatus.PENDING_BILLING",
        "billing.packStatus.ACTIVE",
        "billing.packStatus.NEEDS_ATTENTION",
        "billing.packStatus.CANCELLED",
        "billing.eventDetails",
        "billing.creditsGranted",
        "billing.planSnapshot",
        "billing.noRecoveryPacks",
        "billing.billingHealth",
        "billing.overrideActiveWarning",
        "billing.overrideExpiredNotice",
        "billing.activity",
        "billing.reconciliationUnavailableShort",
      ].map((key) => [key, catalogue[key]]),
    ),
    {
      "billing.tab.appEvents": "App Events",
      "billing.state.REPORTED": "Submitted to Shopify",
      "billing.submittedAt": "Submitted at",
      "billing.asyncReceiptHelp": "Shopify has received the App Event. Billing validation is asynchronous.",
      "billing.devDashboardHelp": "If provider usage does not reconcile, inspect App Billing Event logs in the Shopify Dev Dashboard.",
      "billing.packStatus.PENDING_BILLING": "Awaiting Shopify confirmation",
      "billing.packStatus.ACTIVE": "Active",
      "billing.packStatus.NEEDS_ATTENTION": "Needs attention",
      "billing.packStatus.CANCELLED": "Cancelled",
      "billing.eventDetails": "App Event details",
      "billing.creditsGranted": "Credits",
      "billing.planSnapshot": "Plan handle snapshot",
      "billing.noRecoveryPacks": "No recovery-credit purchases match the current filters.",
      "billing.billingHealth": "Billing status",
      "billing.overrideActiveWarning": "Billing policy override active",
      "billing.overrideExpiredNotice": "An expired billing policy override is recorded.",
      "billing.activity": "Billing activity",
      "billing.reconciliationUnavailableShort": "Shopify usage comparison is not available for this tenant.",
    },
  );
  assert.equal(catalogue["billing.reportedAt"], "Submitted at");
});

test("billing UI exposes the bounded ledger filters and unavailable reconciliation state", async () => {
  const [page, tenant] = await Promise.all([
    readFile(
      path.join(repositoryRoot, "src/app/(protected)/billing/page.tsx"),
      "utf8",
    ),
    readFile(
      path.join(repositoryRoot, "src/components/admin/tenant-billing.tsx"),
      "utf8",
    ),
  ]);

  assert.match(page, /getBillingLedger/);
  assert.match(page, /pageSize: 20/);
  assert.match(page, /firstParam\(rawParams\.state\)/);
  assert.match(tenant, /billing\.discrepancyUnavailable/);
  assert.match(tenant, /pageParam="billingPage"/);
});

test("billing overview does not infer Free exhaustion from a counter threshold", async () => {
  const source = await readFile(
    path.join(repositoryRoot, "src/lib/admin/billing.ts"),
    "utf8",
  );
  const overview = await readFile(
    path.join(repositoryRoot, "src/components/admin/billing-overview.tsx"),
    "utf8",
  );

  assert.match(source, /freeExhausted: null/);
  assert.doesNotMatch(source, /shopEntitlementCounter\.count/);
  assert.match(overview, /overview\.freeExhausted === null/);
  assert.match(overview, /empty\.unavailable/);
});

test("billing ledger preserves report states, diagnostics, and inclusive date boundaries", async () => {
  const [source, overview, tenant] = await Promise.all([
    readFile(path.join(repositoryRoot, "src/lib/admin/billing.ts"), "utf8"),
    readFile(
      path.join(repositoryRoot, "src/components/admin/billing-overview.tsx"),
      "utf8",
    ),
    readFile(
      path.join(repositoryRoot, "src/components/admin/tenant-billing.tsx"),
      "utf8",
    ),
  ]);

  assert.match(source, /billingDateBoundary\(input\.to, true\)/);
  assert.match(source, /from "\.\/billing-presentation\.mjs"/);
  for (const diagnostic of [
    "providerErrorCode",
    "providerResponseSummary",
    "reportAttemptCount",
    "lastReportAttemptAt",
    "reportedAt",
    "shopifyEventHandle",
  ]) {
    assert.match(overview, new RegExp(diagnostic));
  }
  assert.match(overview, /adminBillingReportStateLabel/);
  assert.match(tenant, /adminBillingReportStateLabel/);
});

test("billing helpers preserve cap, expiry, and date boundary semantics", () => {
  assert.equal(effectiveOutboundHardCap(80, 100), 80);
  assert.equal(effectiveOutboundHardCap(150, 100), 100);
  assert.equal(effectiveOutboundHardCap(80, null), null);
  assert.equal(effectiveOutboundHardCap(null, 100), null);

  const now = new Date("2026-09-08T12:00:00.000Z");
  const expiredOverride = {
    expiresAt: new Date("2026-09-08T11:59:59.999Z"),
    outboundHardLimit: 50,
    pauseNewRecoveries: true,
    pauseAutomatedWhatsapp: true,
  };
  assert.equal(billingOverrideState(expiredOverride, now), "EXPIRED");
  assert.equal(expiredOverride.outboundHardLimit, 50);
  assert.equal(expiredOverride.pauseNewRecoveries, true);
  assert.equal(expiredOverride.pauseAutomatedWhatsapp, true);
  assert.equal(effectiveOutboundHardCap(80, 100), 80);

  assert.equal(
    billingDateBoundary("2026-09-08", false).toISOString(),
    "2026-09-08T00:00:00.000Z",
  );
  assert.equal(
    billingDateBoundary("2026-09-08", true).toISOString(),
    "2026-09-08T23:59:59.999Z",
  );
});

test("billing report-state labels use localized values without reported fallback", () => {
  const labels = {
    "billing.state.PENDING": "Pending",
    "billing.state.REPORTED": "Submitted to Shopify",
    "empty.notRecorded": "Not recorded",
  };
  const translate = (key) => labels[key];

  assert.equal(localizedReportStateLabel("PENDING", translate), "Pending");
  assert.notEqual(localizedReportStateLabel("PENDING", translate), "Reported");
  assert.equal(localizedReportStateLabel("REPORTED", translate), "Submitted to Shopify");
});

test("recovery pack statuses use the exact asynchronous billing labels", () => {
  const labels = {
    "billing.packStatus.PENDING_BILLING": "Awaiting Shopify confirmation",
    "billing.packStatus.ACTIVE": "Active",
    "billing.packStatus.NEEDS_ATTENTION": "Needs attention",
    "billing.packStatus.CANCELLED": "Cancelled",
    "empty.notRecorded": "Not recorded",
  };
  const translate = (key) => labels[key];

  assert.deepEqual(
    ["PENDING_BILLING", "ACTIVE", "NEEDS_ATTENTION", "CANCELLED"].map(
      (status) => recoveryCreditPurchaseStatusLabel(status, translate),
    ),
    [
      "Awaiting Shopify confirmation",
      "Active",
      "Needs attention",
      "Cancelled",
    ],
  );
});

test("tenant ledger presentation exposes every safe reporting diagnostic", () => {
  const occurredAt = new Date("2026-09-08T10:00:00.000Z");
  const lastReportAttemptAt = new Date("2026-09-08T10:01:00.000Z");
  const reportedAt = new Date("2026-09-08T10:02:00.000Z");
  const presentation = tenantBillingLedgerPresentation(
    {
      occurredAt,
      metric: "RECOVERY_CONVERSATION",
      quantity: "2",
      shopifyReportState: "RETRYABLE",
      providerErrorCode: "TEMPORARY_FAILURE",
      providerResponseSummary: "Retry scheduled",
      reportAttemptCount: 3,
      lastReportAttemptAt,
      reportedAt,
      shopifyEventHandle: "recovery-meter",
    },
    {
      empty: "Not recorded",
      formatDateTime: (value) => `date:${value.toISOString()}`,
      formatNumber: (value) => `number:${value}`,
      reportStateLabel: (value) => `label:${value}`,
    },
  );

  assert.deepEqual(presentation, {
    occurredAt: "date:2026-09-08T10:00:00.000Z",
    metric: "RECOVERY_CONVERSATION",
    quantity: "number:2",
    reportState: "label:RETRYABLE",
    providerErrorCode: "TEMPORARY_FAILURE",
    providerResponseSummary: "Retry scheduled",
    reportAttemptCount: "number:3",
    lastReportAttemptAt: "date:2026-09-08T10:01:00.000Z",
    reportedAt: "date:2026-09-08T10:02:00.000Z",
    shopifyEventHandle: "recovery-meter",
  });
});

test("tenant billing reports period message usage and ignores expired override caps", async () => {
  const [source, tenant] = await Promise.all([
    readFile(path.join(repositoryRoot, "src/lib/admin/billing.ts"), "utf8"),
    readFile(
      path.join(repositoryRoot, "src/components/admin/tenant-billing.tsx"),
      "utf8",
    ),
  ]);

  assert.match(source, /UsageMetric\.OUTBOUND_AUTOMATED_MESSAGE/);
  assert.match(source, /currentPeriodAutomatedMessageQuantity/);
  assert.match(source, /automatedMessages === null/);
  assert.match(source, /billingOverrideState\(override, now\)/);
  assert.match(source, /effectiveOutboundHardCap/);
  assert.match(tenant, /billing\.automatedMessageUsage/);
  assert.match(tenant, /billing\.effectiveOutboundHardCap/);
  assert.match(tenant, /billing\.overrideExpired/);
});

test("Admin-002 controls remain wired alongside the overview and ledger", async () => {
  const page = await readFile(
    path.join(repositoryRoot, "src/app/(protected)/billing/page.tsx"),
    "utf8",
  );

  assert.match(page, /BillingPlanCatalog/);
  assert.match(page, /PlatformBillingControls/);
  assert.match(page, /getPlatformBillingPolicy/);
  assert.doesNotMatch(page, /<<<<<<<|=======|>>>>>>>/);
});
