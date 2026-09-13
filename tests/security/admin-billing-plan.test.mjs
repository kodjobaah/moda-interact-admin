import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import {
  createInternationalizationRuntime,
  validateIcuCatalogue,
} from "@modainteract/moda-interact-shared/internationalization";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const moduleUrl = pathToFileURL(
  resolve(root, "src/lib/admin/billing-plan-validation.ts"),
).href;
const actionSource = readFileSync(
  resolve(root, "src/app/actions/billing-plan.ts"),
  "utf8",
);
const guardrailSource = readFileSync(
  resolve(root, "src/lib/admin/billing-plan-guardrail.ts"),
  "utf8",
);
const auditModuleUrl = pathToFileURL(
  resolve(root, "src/lib/admin/billing-plan-audit.ts"),
).href;
const guardrailModuleUrl = pathToFileURL(
  resolve(root, "src/lib/admin/billing-plan-guardrail.ts"),
).href;
const validationSource = readFileSync(
  resolve(root, "src/lib/admin/billing-plan-validation.ts"),
  "utf8",
);
const componentSource = readFileSync(
  resolve(root, "src/components/admin/billing-plan-catalog.tsx"),
  "utf8",
);
const requiredKeysSource = readFileSync(
  resolve(root, "src/i18n/required-keys.ts"),
  "utf8",
);

function runBehaviorScript(script) {
  const output = execFileSync(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", script],
    {
      cwd: root,
      env: { ...process.env, NODE_ENV: "test" },
      encoding: "utf8",
    },
  );
  return JSON.parse(output.trim().split("\n").at(-1));
}

function form(values) {
  const entries = {
    intent: "create",
    shopifyPlanHandle: "starter-plan",
    name: "Starter",
    kind: "FREE",
    defaultOutboundSoftLimit: "10",
    defaultOutboundHardLimit: "20",
    terminalMessageReservedSlots: "1",
    reason: "Initial catalog registration",
    ...values,
  };
  return `const form = new FormData(); ${Object.entries(entries)
    .map(
      ([key, value]) =>
        `form.set(${JSON.stringify(key)}, ${JSON.stringify(value)});`,
    )
    .join(" ")}`;
}

test("accepts Free plans without a plan-owned lifetime allowance", () => {
  const result = runBehaviorScript(`
    import { parseBillingPlanForm } from ${JSON.stringify(moduleUrl)};
    ${form({})}
    console.log(JSON.stringify(parseBillingPlanForm(form)));
  `);
  assert.equal(result.kind, "FREE");
  assert.equal("freeLifetimeConversationAllowance" in result, false);
  assert.equal(result.shopifyUsageEventHandle, null);
});

test("enforces mutually exclusive Free and paid billing fields", () => {
  const result = runBehaviorScript(`
    import { parseBillingPlanForm } from ${JSON.stringify(moduleUrl)};
    const attempt = (values) => {
      ${form({})}
      for (const [key, value] of Object.entries(values)) form.set(key, value);
      try { parseBillingPlanForm(form); return false; } catch { return true; }
    };
    console.log(JSON.stringify({
      freeMeterRejected: attempt({ shopifyUsageEventHandle: 'meter' }),
      paidWithoutMeterRejected: attempt({ kind: 'PAID_METERED' }),
      paidAccepted: (() => {
        ${form({ kind: "PAID_METERED", shopifyUsageEventHandle: "meter" })}
        try { return parseBillingPlanForm(form).kind === 'PAID_METERED'; } catch { return false; }
      })(),
    }));
  `);
  assert.deepEqual(result, {
    freeMeterRejected: true,
    paidWithoutMeterRejected: true,
    paidAccepted: true,
  });
});

test("validates the complete recovery-credit pack matrix without price fields", () => {
  const result = runBehaviorScript(`
    import { parseBillingPlanForm } from ${JSON.stringify(moduleUrl)};
    const attempt = (values) => {
      ${form({})}
      for (const [key, value] of Object.entries(values)) form.set(key, value);
      try { return parseBillingPlanForm(form); } catch { return null; }
    };
    const free = {
      recoveryCreditPackEnabled: 'on',
      recoveryCreditsPerPack: '25',
      shopifyRecoveryCreditPackEventHandle: 'pack-meter',
    };
    const paid = {
      kind: 'PAID_METERED',
      shopifyUsageEventHandle: 'recovery-meter',
      recoveryCreditPackEnabled: 'on',
      recoveryCreditsPerPack: '25',
      shopifyRecoveryCreditPackEventHandle: 'pack-meter',
      includedRecoveryConversationAllowance: '200',
    };
    console.log(JSON.stringify({
      freeAccepted: attempt(free),
      paidAccepted: attempt(paid),
      missingPackSizeRejected: attempt({ ...paid, recoveryCreditsPerPack: '' }) === null,
      blankPackSizeRejected: attempt({ ...paid, recoveryCreditsPerPack: '   ' }) === null,
      zeroPackSizeRejected: attempt({ ...paid, recoveryCreditsPerPack: '0' }) === null,
      negativePackSizeRejected: attempt({ ...paid, recoveryCreditsPerPack: '-1' }) === null,
      missingPackHandleRejected: attempt({ ...paid, shopifyRecoveryCreditPackEventHandle: '' }) === null,
      blankPackHandleRejected: attempt({ ...paid, shopifyRecoveryCreditPackEventHandle: '   ' }) === null,
      disabledPackSizeRejected: attempt({ recoveryCreditsPerPack: '25' }) === null,
      disabledPackHandleRejected: attempt({ shopifyRecoveryCreditPackEventHandle: 'pack-meter' }) === null,
      paidZeroAllowanceAccepted: attempt({ ...paid, includedRecoveryConversationAllowance: '0' }) !== null,
      paidNegativeAllowanceRejected: attempt({ ...paid, includedRecoveryConversationAllowance: '-1' }) === null,
      duplicateMeterRejected: attempt({ ...paid, shopifyRecoveryCreditPackEventHandle: 'recovery-meter' }) === null,
    }));
  `);
  assert.equal(result.freeAccepted.recoveryCreditsPerPack, 25);
  assert.equal(result.freeAccepted.shopifyUsageEventHandle, null);
  assert.equal(result.paidAccepted.includedRecoveryConversationAllowance, 200);
  assert.equal(result.missingPackSizeRejected, true);
  assert.equal(result.blankPackSizeRejected, true);
  assert.equal(result.zeroPackSizeRejected, true);
  assert.equal(result.negativePackSizeRejected, true);
  assert.equal(result.missingPackHandleRejected, true);
  assert.equal(result.blankPackHandleRejected, true);
  assert.equal(result.disabledPackSizeRejected, true);
  assert.equal(result.disabledPackHandleRejected, true);
  assert.equal(result.paidZeroAllowanceAccepted, true);
  assert.equal(result.paidNegativeAllowanceRejected, true);
  assert.equal(result.duplicateMeterRejected, true);
});

test("includes all recovery-credit fields in bounded before/after audit snapshots", () => {
  const result = runBehaviorScript(`
    import { billingPlanAuditSnapshot } from ${JSON.stringify(auditModuleUrl)};
    const before = billingPlanAuditSnapshot({
      shopifyPlanHandle: 'starter-plan', name: 'Starter', kind: 'PAID_METERED', active: true,
      shopifyUsageEventHandle: 'recovery-meter', includedRecoveryConversationAllowance: 100,
      recoveryCreditPackEnabled: false, recoveryCreditsPerPack: null,
      shopifyRecoveryCreditPackEventHandle: null,
      defaultOutboundSoftLimit: 10, defaultOutboundHardLimit: 20, terminalMessageReservedSlots: 1,
      features: [],
    });
    const after = billingPlanAuditSnapshot({
      shopifyPlanHandle: 'starter-plan', name: 'Starter', kind: 'PAID_METERED', active: true,
      shopifyUsageEventHandle: 'recovery-meter', includedRecoveryConversationAllowance: 200,
      recoveryCreditPackEnabled: true, recoveryCreditsPerPack: 25,
      shopifyRecoveryCreditPackEventHandle: 'pack-meter',
      defaultOutboundSoftLimit: 10, defaultOutboundHardLimit: 20, terminalMessageReservedSlots: 1,
      features: [],
    });
    console.log(JSON.stringify({ before, after }));
  `);
  assert.deepEqual(
    {
      includedRecoveryConversationAllowance:
        result.before.includedRecoveryConversationAllowance,
      recoveryCreditPackEnabled: result.before.recoveryCreditPackEnabled,
      recoveryCreditsPerPack: result.before.recoveryCreditsPerPack,
      shopifyRecoveryCreditPackEventHandle:
        result.before.shopifyRecoveryCreditPackEventHandle,
    },
    {
      includedRecoveryConversationAllowance: 100,
      recoveryCreditPackEnabled: false,
      recoveryCreditsPerPack: null,
      shopifyRecoveryCreditPackEventHandle: null,
    },
  );
  assert.deepEqual(
    {
      includedRecoveryConversationAllowance:
        result.after.includedRecoveryConversationAllowance,
      recoveryCreditPackEnabled: result.after.recoveryCreditPackEnabled,
      recoveryCreditsPerPack: result.after.recoveryCreditsPerPack,
      shopifyRecoveryCreditPackEventHandle:
        result.after.shopifyRecoveryCreditPackEventHandle,
    },
    {
      includedRecoveryConversationAllowance: 200,
      recoveryCreditPackEnabled: true,
      recoveryCreditsPerPack: 25,
      shopifyRecoveryCreditPackEventHandle: "pack-meter",
    },
  );
  assert.equal(
    (actionSource.match(/BillingAuditAction\.PLAN_CATALOG_CHANGED/g) ?? [])
      .length,
    3,
  );
});

test("keeps pack price out of the server form contract and UI controls", () => {
  assert.doesNotMatch(
    validationSource,
    /formData\.get\(["'][^"']*(?:price|amount|currency)[^"']*["']\)/i,
  );
  const inputNames = [
    ...componentSource.matchAll(/<input\b[^>]*\bname=["']([^"']+)["']/g),
  ].map(([, name]) => name);
  assert.ok(inputNames.length > 0);
  assert(inputNames.every((name) => !/(?:price|amount|currency)/i.test(name)));
});

test("exposes required recovery-credit pack copy through the Admin ICU catalogue", () => {
  const catalogue = JSON.parse(
    readFileSync(resolve(root, "src/i18n/locales/en.json"), "utf8"),
  );
  assert.equal(
    catalogue["billing.recoveryCreditPackHelp"],
    "Pack price is configured in Shopify App Pricing. Moda stores only the pack size and Shopify meter mapping.",
  );
  assert.equal(
    catalogue["billing.recoveryCreditPackRateHelp"],
    "Configure a cheaper recovery-credit-pack meter rate on higher paid plans in Shopify if that is the intended commercial policy.",
  );
  const requiredKeys = [...requiredKeysSource.matchAll(/"([^"]+)"/g)].map(
    ([, key]) => key,
  );
  validateIcuCatalogue(catalogue, requiredKeys, { locale: "en" });
  const runtime = createInternationalizationRuntime({
    locale: "en",
    catalogue,
  });
  assert.equal(
    runtime.t("billing.recoveryCreditPackHelp"),
    catalogue["billing.recoveryCreditPackHelp"],
  );
  assert.equal(
    runtime.t("billing.recoveryCreditPackRateHelp"),
    catalogue["billing.recoveryCreditPackRateHelp"],
  );
});

test("requires bounded safety defaults and a mutation reason", () => {
  const result = runBehaviorScript(`
    import { parseBillingPlanForm } from ${JSON.stringify(moduleUrl)};
    const attempt = (values) => {
      ${form({})}
      for (const [key, value] of Object.entries(values)) form.set(key, value);
      try { parseBillingPlanForm(form); return false; } catch { return true; }
    };
    console.log(JSON.stringify({
      softAboveHardRejected: attempt({ defaultOutboundSoftLimit: '21' }),
      terminalConsumesHardLimitRejected: attempt({ terminalMessageReservedSlots: '20' }),
      missingReasonRejected: attempt({ reason: '' }),
    }));
  `);
  assert.deepEqual(result, {
    softAboveHardRejected: true,
    terminalConsumesHardLimitRejected: true,
    missingReasonRejected: true,
  });
});

test("keeps catalog mutations SUPER_ADMIN-only, immutable, audited, and Prisma-first", () => {
  assert.match(actionSource, /requirePlatformAdminMutation/);
  assert.match(actionSource, /principal\.role !== ['"]SUPER_ADMIN['"]/);
  assert.match(actionSource, /Shopify plan handles are immutable/);
  assert.match(actionSource, /transaction\.billingAuditEvent\.create/);
  assert.doesNotMatch(actionSource, /\$(?:queryRaw|executeRaw)/);
  assert.doesNotMatch(actionSource, /freeLifetimeConversationAllowance/);
  assert.doesNotMatch(validationSource, /freeLifetimeConversationAllowance/);
  assert.doesNotMatch(componentSource, /freeLifetimeConversationAllowance/);
});

test("hard-enforces economics before every economics-affecting catalog write", () => {
  assert.match(
    actionSource,
    /validateSinglePackShopifyEconomics|evaluateBillingUpgradeEdge/,
  );
  assert.match(actionSource, /assertBillingUpgradeEconomicsPass/);
  assert.match(actionSource, /BillingAuditAction\.UPGRADE_ECONOMICS_EVALUATED/);
  const evaluationIndex = actionSource.indexOf(
    "assertBillingUpgradeEconomicsPass",
  );
  const planWriteIndex = actionSource.indexOf("transaction.billingPlan.update");
  assert.ok(evaluationIndex >= 0 && evaluationIndex < planWriteIndex);
  assert.match(actionSource, /billingEconomicsSnapshot\.findMany/);
  assert.match(actionSource, /minimumUpgradePremiumBps/);
  assert.match(guardrailSource, /lowerSnapshotId/);
  assert.match(guardrailSource, /stayAndTopUpCostMinor/);
  assert.match(guardrailSource, /status/);
  assert.match(guardrailSource, /code/);
});

test("shared guardrail adapter preserves PASS, FAIL, and UNVERIFIED outcomes", () => {
  const result = runBehaviorScript(`
    import { evaluateBillingUpgradeEdge, billingUpgradeEconomicsAuditEvidence } from ${JSON.stringify(guardrailModuleUrl)};
    const plans = {
      lower: { id: 'lower', name: 'Starter', kind: 'PAID_METERED', active: true, includedRecoveryConversationAllowance: 100, recoveryCreditPackEnabled: true, recoveryCreditsPerPack: 50, shopifyRecoveryCreditPackEventHandle: 'starter-pack' },
      higher: { id: 'higher', name: 'Growth', kind: 'PAID_METERED', active: true, includedRecoveryConversationAllowance: 400, recoveryCreditPackEnabled: false, recoveryCreditsPerPack: null, shopifyRecoveryCreditPackEventHandle: null },
    };
    const snapshot = { id: 'snapshot-lower', monthlyRecurringAmountMinor: 5000, currency: 'GBP', recoveryCreditPackEnabledSnapshot: true, recoveryCreditsPerPackSnapshot: 50, shopifyRecoveryCreditPackEventHandleSnapshot: 'starter-pack', usagePricingSnapshot: { mode: 'FIXED', currency: 'GBP', unitAmountMinor: 100 } };
    const higherSnapshot = { id: 'snapshot-higher', monthlyRecurringAmountMinor: 5000, currency: 'GBP', recoveryCreditPackEnabledSnapshot: false, recoveryCreditsPerPackSnapshot: null, shopifyRecoveryCreditPackEventHandleSnapshot: null, usagePricingSnapshot: null };
    const evaluate = (lowerSnapshot, higher = plans.higher) => evaluateBillingUpgradeEdge({ edge: { id: 'edge', lowerPlanId: 'lower', higherPlanId: 'higher' }, lowerPlan: plans.lower, higherPlan: higher, lowerSnapshot, higherSnapshot, minimumUpgradePremiumBps: 2000 });
    const pass = evaluate({ ...snapshot, usagePricingSnapshot: { mode: 'FIXED', currency: 'GBP', unitAmountMinor: 2000 } });
    const fail = evaluate(snapshot);
    const unverified = evaluate(null);
    console.log(JSON.stringify({ pass: pass.result.status, fail: fail.result.status, unverified: unverified.result.status, evidence: billingUpgradeEconomicsAuditEvidence(pass, 2000) }));
  `);
  assert.deepEqual(
    { pass: result.pass, fail: result.fail, unverified: result.unverified },
    { pass: "PASS", fail: "FAIL", unverified: "UNVERIFIED" },
  );
  for (const key of [
    "lowerPlanId",
    "higherPlanId",
    "lowerSnapshotId",
    "higherSnapshotId",
    "minimumUpgradePremiumBps",
    "lowerMonthlyIncluded",
    "higherMonthlyIncluded",
    "recoveryCreditsPerPack",
    "packUnitsNeeded",
    "topUpCostMinor",
    "stayAndTopUpCostMinor",
    "upgradeCostMinor",
    "requiredMinimumMinor",
    "premiumBps",
    "status",
    "code",
  ]) {
    assert.ok(Object.hasOwn(result.evidence, key), key);
  }
});

test("fails closed for stale pack evidence and treats proposed top-ups-off as unavailable", () => {
  const result = runBehaviorScript(`
    import { evaluateBillingUpgradeEdge } from ${JSON.stringify(guardrailModuleUrl)};
    const lower = { id: 'lower', name: 'Starter', kind: 'PAID_METERED', active: true, includedRecoveryConversationAllowance: 100, recoveryCreditPackEnabled: true, recoveryCreditsPerPack: 50, shopifyRecoveryCreditPackEventHandle: 'starter-pack' };
    const higher = { id: 'higher', name: 'Growth', kind: 'PAID_METERED', active: true, includedRecoveryConversationAllowance: 400, recoveryCreditPackEnabled: false, recoveryCreditsPerPack: null, shopifyRecoveryCreditPackEventHandle: null };
    const lowerSnapshot = { id: 'snapshot-lower', monthlyRecurringAmountMinor: 5000, currency: 'GBP', recoveryCreditPackEnabledSnapshot: true, recoveryCreditsPerPackSnapshot: 50, shopifyRecoveryCreditPackEventHandleSnapshot: 'starter-pack', usagePricingSnapshot: { mode: 'FIXED', currency: 'GBP', unitAmountMinor: 2000 } };
    const higherSnapshot = { id: 'snapshot-higher', monthlyRecurringAmountMinor: 5000, currency: 'GBP', recoveryCreditPackEnabledSnapshot: false, recoveryCreditsPerPackSnapshot: null, shopifyRecoveryCreditPackEventHandleSnapshot: null, usagePricingSnapshot: null };
    const evaluate = (plan, snapshot = lowerSnapshot) => evaluateBillingUpgradeEdge({ edge: { id: 'edge', lowerPlanId: 'lower', higherPlanId: 'higher' }, lowerPlan: plan, higherPlan: higher, lowerSnapshot: snapshot, higherSnapshot, minimumUpgradePremiumBps: 2000 });
    const sizeMismatch = evaluate({ ...lower, recoveryCreditsPerPack: 25 });
    const handleMismatch = evaluate({ ...lower, shopifyRecoveryCreditPackEventHandle: 'new-starter-pack' });
    const topUpsOff = evaluate({ ...lower, recoveryCreditPackEnabled: false, recoveryCreditsPerPack: null, shopifyRecoveryCreditPackEventHandle: null });
    const exact = evaluate(lower);
    console.log(JSON.stringify({
      exact: [exact.result.status, exact.result.code],
      sizeMismatch: [sizeMismatch.result.status, sizeMismatch.result.code],
      handleMismatch: [handleMismatch.result.status, handleMismatch.result.code],
      topUpsOff: [topUpsOff.result.status, topUpsOff.result.code],
    }));
  `);
  assert.deepEqual(result, {
    exact: ["PASS", "UPGRADE_ECONOMICS_OK"],
    sizeMismatch: ["UNVERIFIED", "INVALID_TOPUP_CONFIGURATION"],
    handleMismatch: ["UNVERIFIED", "INVALID_TOPUP_CONFIGURATION"],
    topUpsOff: ["PASS", "NO_TOPUPS_AVAILABLE"],
  });
});

test("records persisted before values and resulting after values for paid-plan edits", () => {
  const result = runBehaviorScript(`
    import { billingPlanAuditSnapshot } from ${JSON.stringify(auditModuleUrl)};
    const existing = {
      shopifyPlanHandle: 'starter-plan',
      name: 'Old',
      kind: 'PAID_METERED',
      active: true,
      shopifyUsageEventHandle: 'meter-v1',
      includedRecoveryConversationAllowance: 100,
      recoveryCreditPackEnabled: false,
      recoveryCreditsPerPack: null,
      shopifyRecoveryCreditPackEventHandle: null,
      defaultOutboundSoftLimit: 10,
      defaultOutboundHardLimit: 20,
      terminalMessageReservedSlots: 1,
      features: [
        { feature: 'CHECKOUT_RECOVERY', enabled: true },
        { feature: 'PRODUCT_SEARCH', enabled: false },
      ],
    };
    const requested = {
      ...existing,
      name: 'New',
      shopifyUsageEventHandle: 'meter-v2',
      includedRecoveryConversationAllowance: 200,
      recoveryCreditPackEnabled: true,
      recoveryCreditsPerPack: 25,
      shopifyRecoveryCreditPackEventHandle: 'pack-meter',
      defaultOutboundHardLimit: 30,
      features: ['CHECKOUT_RECOVERY', 'PRODUCT_SEARCH'],
    };
    console.log(JSON.stringify({
      before: billingPlanAuditSnapshot(existing),
      after: billingPlanAuditSnapshot(requested),
    }));
  `);
  assert.equal(result.before.shopifyUsageEventHandle, "meter-v1");
  assert.equal(result.before.name, "Old");
  assert.equal(result.before.defaultOutboundHardLimit, 20);
  assert.equal(result.before.includedRecoveryConversationAllowance, 100);
  assert.equal(result.before.recoveryCreditPackEnabled, false);
  assert.equal(result.before.recoveryCreditsPerPack, null);
  assert.equal(result.before.shopifyRecoveryCreditPackEventHandle, null);
  assert.equal(result.after.shopifyUsageEventHandle, "meter-v2");
  assert.equal(result.after.name, "New");
  assert.equal(result.after.defaultOutboundHardLimit, 30);
  assert.equal(result.after.includedRecoveryConversationAllowance, 200);
  assert.equal(result.after.recoveryCreditPackEnabled, true);
  assert.equal(result.after.recoveryCreditsPerPack, 25);
  assert.equal(result.after.shopifyRecoveryCreditPackEventHandle, "pack-meter");
});
