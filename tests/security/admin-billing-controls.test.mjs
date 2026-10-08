import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { test } from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const validationUrl = pathToFileURL(
  resolve(root, "src/lib/admin/billing-control-validation.ts"),
).href;
const actionSource = readFileSync(
  resolve(root, "src/app/actions/billing-controls.ts"),
  "utf8",
);

function runBehaviorScript(script) {
  const output = execFileSync(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", script],
    { cwd: root, env: { ...process.env, NODE_ENV: "test" }, encoding: "utf8" },
  );
  return JSON.parse(output.trim().split("\n").at(-1));
}

test("accepts strict non-negative lifetime Free defaults", () => {
  const result = runBehaviorScript(`
    import { parsePlatformBillingPolicyForm } from ${JSON.stringify(validationUrl)};
    const attempt = (value) => {
      const form = new FormData();
      for (const [key, entry] of Object.entries({ absoluteOutboundHardLimit: '20', defaultOutboundSoftLimit: '10', defaultOutboundHardLimit: '20', terminalMessageReservedSlots: '1', defaultWarningPercent: '80', lifetimeFreeRecoveryAllowance: value, minimumUpgradePremiumBps: '2000', reason: 'policy change' })) form.set(key, entry);
      try { return parsePlatformBillingPolicyForm(form).lifetimeFreeRecoveryAllowance; } catch { return null; }
    };
    console.log(JSON.stringify({
      accepted: attempt('7'),
      negativeRejected: attempt('-1'),
      blankRejected: attempt(''),
      decimalRejected: attempt('1.5'),
      nanRejected: attempt('NaN'),
    }));
  `);
  assert.deepEqual(result, {
    accepted: 7,
    negativeRejected: null,
    blankRejected: null,
    decimalRejected: null,
    nanRejected: null,
  });
});

test("enforces existing platform policy bounds and a required reason", () => {
  const result = runBehaviorScript(`
    import { parsePlatformBillingPolicyForm } from ${JSON.stringify(validationUrl)};
    const attempt = (values) => {
      const form = new FormData();
      for (const [key, value] of Object.entries({ absoluteOutboundHardLimit: '20', defaultOutboundSoftLimit: '10', defaultOutboundHardLimit: '20', terminalMessageReservedSlots: '1', defaultWarningPercent: '80', lifetimeFreeRecoveryAllowance: '5', minimumUpgradePremiumBps: '2000', reason: 'policy change', ...values })) form.set(key, value);
      try { parsePlatformBillingPolicyForm(form); return false; } catch { return true; }
    };
    console.log(JSON.stringify({
      warningAbove100Rejected: attempt({ defaultWarningPercent: '101' }),
      zeroHardLimitRejected: attempt({ absoluteOutboundHardLimit: '0' }),
      terminalReserveAtHardLimitRejected: attempt({ defaultOutboundHardLimit: '2', terminalMessageReservedSlots: '2' }),
      missingReasonRejected: attempt({ reason: '' }),
    }));
  `);
  assert.deepEqual(result, {
    warningAbove100Rejected: true,
    zeroHardLimitRejected: true,
    terminalReserveAtHardLimitRejected: true,
    missingReasonRejected: true,
  });
});

test("keeps policy creation Prisma-safe while auditing the mutation reason", () => {
  const createBlock = actionSource.match(
    /platformBillingPolicy\.upsert\(\{[\s\S]*?create: \{([\s\S]*?)\n\s+\},\n\s+update:/,
  )?.[1];
  assert.ok(createBlock);
  assert.doesNotMatch(createBlock, /\.\.\.values/);
  assert.match(
    createBlock,
    /lifetimeFreeRecoveryAllowance: values\.lifetimeFreeRecoveryAllowance/,
  );
  assert.doesNotMatch(createBlock, /reason/);
  assert.match(
    actionSource,
    /reason: values\.reason,\n\s+relatedEntityType: "PlatformBillingPolicy"/,
  );
  assert.match(
    actionSource,
    /lifetimeFreeRecoveryAllowance: values\.lifetimeFreeRecoveryAllowance,\n\s+version: \{ increment: 1 \}/,
  );
});

test("preserves nullable shop override inheritance and validates effective limits", () => {
  const result = runBehaviorScript(`
    import { parseShopBillingOverrideForm } from ${JSON.stringify(validationUrl)};
    const form = new FormData();
    form.set('shopId', 'shop-1');
    form.set('pauseNewRecoveries', 'inherit');
    form.set('pauseAutomatedWhatsapp', 'off');
    form.set('reason', 'temporary support override');
    const parsed = parseShopBillingOverrideForm(form);
    console.log(JSON.stringify({ inherited: parsed.pauseNewRecoveries, disabled: parsed.pauseAutomatedWhatsapp, expiry: parsed.expiresAt }));
  `);
  assert.deepEqual(result, { inherited: null, disabled: false, expiry: null });
});

test("keeps controls protected, audited, append-only, and Prisma-first", () => {
  assert.match(actionSource, /requirePlatformAdminMutation/);
  assert.match(actionSource, /principal\.role !== ['"]SUPER_ADMIN['"]/);
  assert.match(actionSource, /transaction\.billingAuditEvent\.create/g);
  assert.doesNotMatch(
    actionSource,
    /billingAllowanceAdjustment|FREE_ALLOWANCE_ADJUSTED/,
  );
  assert.match(actionSource, /lifetimeFreeRecoveryAllowance/);
  assert.doesNotMatch(actionSource, /\$(?:queryRaw|executeRaw)/);
  assert.doesNotMatch(
    actionSource,
    /committedQuantity|reservedQuantity.*update/,
  );
});

test("keeps policy changes protected, audited, and internal-only", () => {
  assert.match(actionSource, /PLATFORM_POLICY_CHANGED/);
  assert.match(actionSource, /beforeValue/);
  assert.match(actionSource, /afterValue/);
  const componentSource = readFileSync(
    resolve(root, "src/components/admin/billing-controls.tsx"),
    "utf8",
  );
  assert.match(componentSource, /name="lifetimeFreeRecoveryAllowance"/);
  assert.match(componentSource, /policy\?\.lifetimeFreeRecoveryAllowance/);
  const catalogue = JSON.parse(
    readFileSync(resolve(root, "src/i18n/locales/en.json"), "utf8"),
  );
  assert.equal(
    catalogue["billingControls.lifetimeFreeRecoveryAllowanceHelp"],
    "This value is snapshotted only when a merchant receives its first verified subscription activation. Changing it affects future first activations only; it does not reset or increase existing merchants' lifetime grants.",
  );
  const pageSource = readFileSync(
    resolve(root, "src/app/(protected)/system-controls/platform-policy/page.tsx"),
    "utf8",
  );
  assert.match(pageSource, /requirePlatformAdminPage/);
  assert.match(pageSource, /PlatformPolicyControls/);
  assert.match(pageSource, /<AdminShell active="platform-policy">/);
});

test("platform policy explains the controls and reports mutations inline with duplicate-submit protection", () => {
  const componentSource = readFileSync(
    resolve(root, "src/components/admin/billing-controls.tsx"),
    "utf8",
  );
  const formSource = readFileSync(
    resolve(root, "src/components/admin/platform-policy-form.tsx"),
    "utf8",
  );
  const catalogue = JSON.parse(
    readFileSync(resolve(root, "src/i18n/locales/en.json"), "utf8"),
  );

  for (const key of [
    "billingControls.platformRequiredDescription",
    "billingControls.absoluteHardLimitHelp",
    "billingControls.defaultSoftLimitHelp",
    "billingControls.defaultHardLimitHelp",
    "billingControls.terminalReservedSlotsHelp",
    "billingControls.minimumUpgradePremiumHelp",
    "billingControls.warningPercentHelp",
    "billingControls.pauseNewRecoveriesHelp",
    "billingControls.pauseAutomatedWhatsappHelp",
    "billingControls.reasonHelp",
  ]) {
    assert.equal(typeof catalogue[key], "string");
    assert.ok(catalogue[key].length > 20);
  }

  assert.match(componentSource, /billingControls\.platformLimitRulesDescription/);
  assert.match(formSource, /role=\{result\.ok \? "status" : "alert"\}/);
  assert.match(formSource, /submittingRef\.current/);
  assert.match(formSource, /disabled=\{pending\}/);
  assert.match(formSource, /mutatePlatformBillingPolicyAction/);
  assert.match(actionSource, /Promise<PlatformBillingPolicyActionResult>/);
  assert.match(actionSource, /return \{ ok: false, message: platformBillingPolicyClientMessage\(cause\) \}/);
});

test("server validation enforces the platform ceiling and soft-below-hard rule", () => {
  assert.match(
    actionSource,
    /values\.outboundHardLimit > platform\.absoluteOutboundHardLimit/,
  );
  assert.match(actionSource, /effectiveSoft >= effectiveHard/);
  assert.match(
    actionSource,
    /values\.recoverySafetyCeiling > platform\.absoluteOutboundHardLimit/,
  );
});

test("authorizes shop override mutations according to existing hard controls", () => {
  const result = runBehaviorScript(`
    import { shopBillingOverrideRequiresSuperAdmin } from ${JSON.stringify(validationUrl)};
    const decision = (values, existing = null) => shopBillingOverrideRequiresSuperAdmin(values, existing);
    console.log(JSON.stringify({
      adminFirstSoftOnlyRequiresSuperAdmin: decision({ outboundSoftLimit: 5, outboundHardLimit: null, recoverySafetyCeiling: null }),
      adminFirstPauseOnlyRequiresSuperAdmin: decision({ outboundSoftLimit: null, outboundHardLimit: null, recoverySafetyCeiling: null }),
      adminSetsHardRequiresSuperAdmin: decision({ outboundSoftLimit: null, outboundHardLimit: 10, recoverySafetyCeiling: null }),
      adminSetsRecoveryCeilingRequiresSuperAdmin: decision({ outboundSoftLimit: null, outboundHardLimit: null, recoverySafetyCeiling: 10 }),
      adminRemovesExistingHardRequiresSuperAdmin: decision({ outboundSoftLimit: null, outboundHardLimit: null, recoverySafetyCeiling: null }, { outboundHardLimit: 10, recoverySafetyCeiling: null }),
      superAdminHardMutationAllowed: decision({ outboundSoftLimit: null, outboundHardLimit: 10, recoverySafetyCeiling: null }),
    }));
  `);
  assert.deepEqual(result, {
    adminFirstSoftOnlyRequiresSuperAdmin: false,
    adminFirstPauseOnlyRequiresSuperAdmin: false,
    adminSetsHardRequiresSuperAdmin: true,
    adminSetsRecoveryCeilingRequiresSuperAdmin: true,
    adminRemovesExistingHardRequiresSuperAdmin: true,
    superAdminHardMutationAllowed: true,
  });
});

test("rejects impossible calendar expiry dates and accepts leap days", () => {
  const result = runBehaviorScript(`
    import { parseShopBillingOverrideForm } from ${JSON.stringify(validationUrl)};
    const attempt = (expiresAt) => {
      const form = new FormData();
      form.set('shopId', 'shop-1');
      form.set('expiresAt', expiresAt);
      form.set('reason', 'date validation');
      try {
        const parsed = parseShopBillingOverrideForm(form);
        return { accepted: true, iso: parsed.expiresAt?.toISOString() ?? null };
      } catch {
        return { accepted: false };
      }
    };
    console.log(JSON.stringify({
      empty: attempt(''),
      normal: attempt('2026-02-28'),
      invalidLeap: attempt('2026-02-29'),
      validLeap: attempt('2028-02-29'),
      invalidFebruary: attempt('2026-02-31'),
      invalidApril: attempt('2026-04-31'),
      malformed: attempt('2026/04/30'),
    }));
  `);
  assert.deepEqual(result, {
    empty: { accepted: true, iso: null },
    normal: { accepted: true, iso: "2026-02-28T23:59:59.999Z" },
    invalidLeap: { accepted: false },
    validLeap: { accepted: true, iso: "2028-02-29T23:59:59.999Z" },
    invalidFebruary: { accepted: false },
    invalidApril: { accepted: false },
    malformed: { accepted: false },
  });
});
