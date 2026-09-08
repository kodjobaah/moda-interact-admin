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

test("enforces platform policy bounds and a required reason", () => {
  const result = runBehaviorScript(`
    import { parsePlatformBillingPolicyForm } from ${JSON.stringify(validationUrl)};
    const attempt = (values) => {
      const form = new FormData();
      for (const [key, value] of Object.entries({ absoluteOutboundHardLimit: '20', defaultWarningPercent: '80', reason: 'policy change', ...values })) form.set(key, value);
      try { parsePlatformBillingPolicyForm(form); return false; } catch { return true; }
    };
    console.log(JSON.stringify({
      warningAbove100Rejected: attempt({ defaultWarningPercent: '101' }),
      zeroHardLimitRejected: attempt({ absoluteOutboundHardLimit: '0' }),
      missingReasonRejected: attempt({ reason: '' }),
    }));
  `);
  assert.deepEqual(result, {
    warningAbove100Rejected: true,
    zeroHardLimitRejected: true,
    missingReasonRejected: true,
  });
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
  assert.match(actionSource, /transaction\.billingAllowanceAdjustment\.create/);
  assert.doesNotMatch(actionSource, /\$(?:queryRaw|executeRaw)/);
  assert.doesNotMatch(
    actionSource,
    /committedQuantity|reservedQuantity.*update/,
  );
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
