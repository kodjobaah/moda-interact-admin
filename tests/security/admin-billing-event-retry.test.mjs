import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function source(relative) {
  return readFile(path.join(root, relative), "utf8");
}

test("App Event retry is SUPER_ADMIN-only, worker-owned, audited and identity preserving", async () => {
  const action = await source("src/app/actions/billing-events.ts");

  assert.match(action, /requirePlatformAdminMutation\(\)/);
  assert.match(action, /principal\.role !== "SUPER_ADMIN"/);
  assert.match(action, /ShopifyReportState\.RETRYABLE/);
  assert.match(action, /ShopifyReportState\.NEEDS_ATTENTION/);
  assert.match(action, /action: BillingAuditAction\.BILLING_EVENT_RETRY/);
  assert.match(action, /relatedEntityType: "UsageEvent"/);
  assert.match(action, /shopifyReportState: ShopifyReportState\.RETRYABLE/);
  assert.match(action, /nextReportAt: now/);

  const mutation = action.slice(action.indexOf("transaction.usageEvent.updateMany"), action.indexOf("transaction.billingAuditEvent.create"));
  assert.doesNotMatch(mutation, /quantity:\s*|occurredAt:\s*|shopifyEventHandle:\s*|shopifyIdempotencyKey:\s*|idempotencyKey:\s*/);
  assert.doesNotMatch(action, /fetch\(|axios|api\.shopify\.com/);
});

test("App Event retry uses compare-and-set state so repeated submits do not queue twice", async () => {
  const action = await source("src/app/actions/billing-events.ts");
  assert.match(action, /event\.shopifyReportState !== expectedState/);
  assert.match(action, /event\.reportAttemptCount !== expectedAttemptCount/);
  assert.match(action, /!sameDate\(event\.nextReportAt, expectedNextReportAt\)/);
  assert.match(action, /reportAttemptCount: event\.reportAttemptCount/);
  assert.match(action, /nextReportAt: event\.nextReportAt/);
  assert.match(action, /if \(updated\.count !== 1\) return "stale"/);
});

test("App Event retry UI prevents double clicks and is shown only for retryable failure states", async () => {
  const [control, drawer, page] = await Promise.all([
    source("src/components/admin/billing-event-retry-control.tsx"),
    source("src/components/admin/billing-drawers.tsx"),
    source("src/app/(protected)/billing/page.tsx"),
  ]);

  assert.match(control, /useFormStatus\(\)/);
  assert.match(control, /disabled=\{pending\}/);
  assert.match(control, /form\.dataset\.submitting === "true"/);
  assert.match(control, /event\.preventDefault\(\)/);
  assert.match(drawer, /event\.shopifyReportState === "RETRYABLE"/);
  assert.match(drawer, /event\.shopifyReportState === "NEEDS_ATTENTION"/);
  assert.match(drawer, /retryAlreadyDue/);
  assert.match(drawer, /billing\.retryEventQueuedHelp/);
  assert.doesNotMatch(drawer, /event\.shopifyReportState === "REPORTED"[^?]*BillingEventRetryControl/s);
  assert.match(page, /canRetry=\{principal\.role === "SUPER_ADMIN"\}/);
});

test("App Event retry copy is registered through Admin i18n", async () => {
  const [catalogue, required] = await Promise.all([
    source("src/i18n/locales/en.json").then(JSON.parse),
    source("src/i18n/required-keys.ts"),
  ]);
  for (const key of [
    "billing.nextReportAt",
    "billing.retryEventTitle",
    "billing.retryEventHelp",
    "billing.retryEventReason",
    "billing.retryEvent",
    "billing.retryEventPending",
    "billing.retryEventQueuedHelp",
    "billing.retryEventResult.QUEUED",
    "billing.retryEventResult.ALREADY_DUE",
    "billing.retryEventResult.STALE",
    "billing.retryEventResult.NOT_ELIGIBLE",
    "billing.retryEventResult.MISSING",
    "billing.retryEventResult.ERROR",
  ]) {
    assert.equal(typeof catalogue[key], "string");
    assert.match(required, new RegExp(key.replaceAll(".", "\\.")));
  }
});
