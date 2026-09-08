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
