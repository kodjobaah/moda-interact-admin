import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("refund triage is bounded and derives the ARCH-015 queue states", async () => {
  const source = await readFile(path.join(root, "src/lib/admin/recovery-credit-refunds.ts"), "utf8");
  assert.match(source, /requirePlatformAdminRead\(\)/);
  assert.match(source, /skip: \(page - 1\) \* pageSize/);
  assert.match(source, /take: pageSize/);
  assert.match(source, /READY_FOR_REFUND_PROCESSING/);
  assert.equal(source.includes(["READY_FOR", "PROVIDER_ACTION"].join("_")), false);
  assert.match(source, /reservedAmount: 0/);
  assert.match(source, /reservedAmount: \{ gt: 0 \}/);
  assert.match(source, /currentAmount: \{ gt: 0 \}/);
  assert.match(source, /automaticCorrectionUsageEventId: true/);
  assert.match(source, /automaticCorrectionUsageEvent:/);
  assert.match(source, /quantity: row\.automaticCorrectionUsageEvent\.quantity\.toString\(\)/);
  assert.match(source, /providerUsageQuantityBeforeCorrection/);
  assert.match(source, /expectedProviderUsageCostAfterCorrection/);
  assert.doesNotMatch(source, /update\(|create\(|delete\(/);
});

test("refund drawer is read-only for REQUESTED and uses progressive evidence disclosure", async () => {
  const [component, page] = await Promise.all([
    readFile(path.join(root, "src/components/admin/recovery-credit-refunds.tsx"), "utf8"),
    readFile(path.join(root, "src/app/(protected)/billing/page.tsx"), "utf8"),
  ]);
  assert.match(page, /getRecoveryCreditRefunds/);
  assert.match(page, /getRecoveryCreditRefundDetail/);
  assert.match(component, /READY_FOR_REFUND_PROCESSING/);
  assert.match(component, /readyForProcessing/);
  assert.match(component, /automaticCorrectionUsageEventId/);
  assert.match(component, /automaticSafetyWarning/);
  assert.match(component, /completedAutomatic/);
  assert.match(component, /completedManual/);
  assert.match(component, /recordRecoveryCreditProviderEvidenceAction/);
  assert.match(component, /status !== RecoveryCreditRefundStatus\.PROVIDER_ACTION_REQUIRED/);
  assert.match(component, /automaticCorrectionUsageEventId !== null/);
  assert.match(component, /<details/);
  assert.match(component, /purchaseProvenance/);
  assert.match(component, /view: "events", eventId: refund\.automaticCorrectionUsageEventId/);
  const legacyLockAction = ["lockRecoveryCredit", "Refund", "Action"].join("");
  const legacyRejectAction = ["rejectRecoveryCredit", "Refund", "Action"].join("");
  assert.equal(component.includes(legacyLockAction), false);
  assert.equal(component.includes(legacyRejectAction), false);
  assert.equal(component.includes(["READY_FOR", "PROVIDER_ACTION"].join("_")), false);
  assert.match(component, /canSettle: boolean/);
  assert.match(component, /canSettle/);
  assert.equal(component.includes(["Lock", " provider action"].join("")), false);
  assert.equal(component.includes(["Reject", " request"].join("")), false);
  assert.equal(component.toLowerCase().includes(["mark", " complete"].join("")), false);
});