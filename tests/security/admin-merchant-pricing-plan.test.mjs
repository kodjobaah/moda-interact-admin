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
  assert.match(
    identity,
    /reserved development platform administrator identity conflicts/,
  );
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
    "src/components/admin/merchant-pricing-translation-workbook.tsx",
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

test("usage-event builder exposes currency-aware labels and blocks unbounded free events", async () => {
  const builder = await source(
    "src/components/admin/merchant-pricing-plan-builder.tsx",
  );
  assert.match(builder, /Admin label/);
  assert.match(builder, /Shopify usage-event handle/);
  assert.match(builder, /Recovery credits granted per event/);
  assert.match(builder, /Maximum uses per billing period \(optional\)/);
  assert.match(builder, /<option value="FIXED">Fixed price<\/option>/);
  assert.match(
    builder,
    /<option value="GRADUATED">Graduated pricing<\/option>/,
  );
  assert.match(builder, /<option value="VOLUME">Volume pricing<\/option>/);
  assert.match(
    builder,
    /Price per usage event \(\{currency\.toUpperCase\(\)\}\)/,
  );
  assert.match(builder, /Price per unit \(\{currency\.toUpperCase\(\)\}\)/);
  assert.match(
    builder,
    /Additional flat charge \(\{currency\.toUpperCase\(\)\}\)/,
  );
  assert.match(builder, /Unlimited/);
  assert.match(builder, /ZERO_COST_USAGE_EVENT_MESSAGE/);
  assert.match(builder, /events\.some\(hasUnboundedZeroCostFixedEvent\)/);
  assert.match(builder, /usageEvents: events\.map\(serializeBuilderEvent\)/);
  assert.match(builder, /Show technical details/);
});

test("translation workbook keeps schema-v2 guidance and upload failures non-destructive", async () => {
  const workbook = await source(
    "src/components/admin/merchant-pricing-translation-workbook.tsx",
  );
  assert.match(workbook, /Download pre-populated translation spreadsheet/);
  assert.match(workbook, /processSelectedTranslationWorkbook/);
  assert.match(workbook, /Drop your completed \.xlsx spreadsheet here/);
  assert.match(workbook, /Choose spreadsheet/);
  assert.match(workbook, /type="file"/);
  assert.match(
    workbook,
    /accept="\.xlsx,application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet"/,
  );
  assert.match(workbook, /Upload one spreadsheet at a time\./);
  assert.match(workbook, /The translation spreadsheet is larger than 2 MiB\./);
  assert.match(workbook, /Choose an Excel workbook ending in \.xlsx\./);
  assert.match(workbook, /The translation spreadsheet could not be read\./);
  assert.match(workbook, /selectedFileName/);
  assert.match(workbook, /workbookIssues/);
  assert.match(
    workbook,
    /onChange\(parsed\.canonicalRawJson, parsed\.translationResult\)/,
  );
  assert.match(workbook, /Show technical details/);
  assert.doesNotMatch(
    workbook,
    /Paste completed translation JSON|Choose JSON file|\.json/,
  );
  await assert.rejects(
    source("src/components/admin/merchant-pricing-translation-import.tsx"),
  );
});

test("final review uses the exact human-readable fixed usage-event summary", async () => {
  const builder = await source(
    "src/components/admin/merchant-pricing-plan-builder.tsx",
  );
  assert.match(builder, /formatBuilderEventPrice\(event, currency\)/);
  assert.match(
    builder,
    /per event · \$\{event\.maximumUnitsPerBillingPeriod \?\? "Unlimited"\}/,
  );
  assert.doesNotMatch(
    builder,
    /event · \{event\.pricingMode === "FIXED" \? "fixed price"/,
  );
});
