import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

test("billing reads stay platform-admin protected and tenant scoped", async () => {
  const source = await readFile(
    path.join(repositoryRoot, "src/lib/admin/billing.ts"),
    "utf8",
  );

  assert.equal((source.match(/requirePlatformAdminRead\(\)/g) ?? []).length, 3);
  assert.match(source, /shopId: input\.shopId/);
  assert.match(source, /shopId,/);
  assert.match(source, /metric: UsageMetric\.RECOVERY_CONVERSATION/);
  assert.match(source, /take: pageSize/);
  assert.match(source, /providerErrorCode: true/);
  assert.doesNotMatch(
    source,
    /providerAccessToken|providerSecret|accessToken|apiKey/,
  );
  assert.match(source, /discrepancy: null/);
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
  assert.match(source, /23:59:59\.999/);
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
  assert.match(source, /override\.expiresAt > now/);
  assert.match(
    source,
    /Math\.min\(configuredHardLimit, policy\.absoluteOutboundHardLimit\)/,
  );
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
