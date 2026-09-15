import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("MerchantPricing mutation requires SUPER_ADMIN and revalidates server payload", async () => {
  const action = await source("src/app/actions/merchant-pricing-plan.ts");
  assert.match(action, /requirePlatformAdminMutation/);
  assert.match(action, /principal\.role !== "SUPER_ADMIN"/);
  assert.match(action, /parseMerchantPricingBuilderPayload/);
  assert.match(action, /parseCompletedMerchantPricingTranslationPackage/);
  assert.match(action, /prisma\.\$transaction/);
});

test("development billing audits use the reserved provisioned administrator identity", async () => {
  const action = await source("src/app/actions/merchant-pricing-plan.ts");
  const identity = await source("src/lib/auth/development-platform-admin.ts");

  assert.match(action, /ensureDevelopmentPlatformAdmin/);
  assert.match(action, /DEVELOPMENT_PLATFORM_ADMIN\.id/);
  assert.doesNotMatch(action, /platformAdmin\.findFirst/);
  assert.match(identity, /id: 'development-platform-admin'/);
  assert.match(identity, /role: 'SUPER_ADMIN'/);
  assert.match(identity, /if \(!principal\.developmentBypass\) return;/);
  assert.match(identity, /ON CONFLICT \("id"\) DO NOTHING/);
  assert.match(identity, /reserved development platform administrator identity conflicts/);
});

test("ARCH-014 implementation modules do not use operational plan or economics sources", async () => {
  const paths = [
    "src/app/actions/merchant-pricing-plan.ts",
    "src/lib/admin/merchant-pricing-plan.ts",
    "src/lib/admin/merchant-pricing-builder-payload.ts",
    "src/lib/admin/merchant-pricing-economics.ts",
    "src/lib/admin/merchant-pricing-translations.ts",
    "src/components/admin/merchant-pricing-plan-catalog.tsx",
    "src/components/admin/merchant-pricing-plan-builder.tsx",
    "src/components/admin/merchant-pricing-translation-import.tsx",
  ];
  const contents = await Promise.all(paths.map(source));
  const combined = contents.join("\n");
  for (const forbidden of [
    "BillingPlan",
    "BillingEconomicsSnapshot",
    "BillingUpgradeEconomicsEdge",
    "getBillingPlans",
    "getBillingPlanById",
    "mutateBillingPlanAction",
  ]) {
    assert.equal(
      combined.includes(forbidden),
      false,
      `unexpected operational dependency: ${forbidden}`,
    );
  }
});

test("ARCH-014 action never creates a Shopify subscription", async () => {
  const action = await source("src/app/actions/merchant-pricing-plan.ts");
  assert.equal(
    /subscriptionCreate|appSubscription|shopify.*subscription/i.test(action),
    false,
  );
});

test("toggle reasons are bounded like create and edit reasons", async () => {
  const action = await source("src/app/actions/merchant-pricing-plan.ts");
  assert.match(action, /reason\.trim\(\)\.length > 2000/);
});
