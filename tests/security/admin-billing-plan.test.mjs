import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { test } from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const moduleUrl = pathToFileURL(
  resolve(root, "src/lib/admin/billing-plan-validation.ts"),
).href;
const actionSource = readFileSync(
  resolve(root, "src/app/actions/billing-plan.ts"),
  "utf8",
);
const auditModuleUrl = pathToFileURL(
  resolve(root, "src/lib/admin/billing-plan-audit.ts"),
).href;

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
    freeLifetimeConversationAllowance: "5",
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

test("accepts Free plans with the default positive lifetime allowance and no meter", () => {
  const result = runBehaviorScript(`
    import { parseBillingPlanForm } from ${JSON.stringify(moduleUrl)};
    ${form({})}
    console.log(JSON.stringify(parseBillingPlanForm(form)));
  `);
  assert.equal(result.kind, "FREE");
  assert.equal(result.freeLifetimeConversationAllowance, 5);
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
      paidWithoutMeterRejected: attempt({ kind: 'PAID_METERED', freeLifetimeConversationAllowance: '' }),
      paidFreeAllowanceRejected: attempt({ kind: 'PAID_METERED', shopifyUsageEventHandle: 'meter' }),
      paidAccepted: (() => {
        ${form({ kind: "PAID_METERED", freeLifetimeConversationAllowance: "", shopifyUsageEventHandle: "meter" })}
        try { return parseBillingPlanForm(form).kind === 'PAID_METERED'; } catch { return false; }
      })(),
    }));
  `);
  assert.deepEqual(result, {
    freeMeterRejected: true,
    paidWithoutMeterRejected: true,
    paidFreeAllowanceRejected: true,
    paidAccepted: true,
  });
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
      freeLifetimeConversationAllowance: null,
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
  assert.equal(result.after.shopifyUsageEventHandle, "meter-v2");
  assert.equal(result.after.name, "New");
  assert.equal(result.after.defaultOutboundHardLimit, 30);
});

test("does not default an existing paid plan to a Free allowance", () => {
  assert.match(
    readFileSync(
      resolve(root, "src/components/admin/billing-plan-catalog.tsx"),
      "utf8",
    ),
    /plan\.freeLifetimeConversationAllowance \?\? \"\"/,
  );
});
