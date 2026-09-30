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
    "src/lib/admin/merchant/pricing-plan.ts",
    "src/lib/admin/merchant/pricing-builder-payload.ts",
    "src/lib/admin/merchant/pricing-economics.ts",
    "src/lib/admin/merchant/pricing-translations.ts",
    "src/components/admin/merchant/merchant-pricing-plan-catalog.tsx",
    "src/components/admin/merchant/merchant-pricing-plan-builder.tsx",
    "src/components/admin/merchant/merchant-pricing-translation-workbook.tsx",
  ];
  const contents = await Promise.all(paths.map(source));
  const action = contents[0];
  const nonActionModules = contents.slice(1).join("\n");
  for (const forbidden of [
    "BillingEconomicsSnapshot",
    "BillingUpgradeEconomicsEdge",
    "getBillingPlans",
    "getBillingPlanById",
    "mutateBillingPlanAction",
  ]) {
    assert.equal(
      nonActionModules.includes(forbidden),
      false,
      `unexpected operational dependency outside the existing save action: ${forbidden}`,
    );
  }
  assert.match(action, /transaction\.billingPlan\.update/);
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

test("generic Feature toggle protects the active Merchant Knowledge product Feature", async () => {
  const action = await source("src/app/actions/feature-catalogue.ts");
  assert.match(
    action,
    /key === "merchant_knowledge"\)[\s\S]*?Merchant Knowledge is managed by pricing-plan product policy\./,
  );
  assert.match(
    action,
    /data: \{ displayName, description: description \|\| null \}/,
  );
  assert.match(
    action,
    /Merchant Knowledge is included by pricing-plan product policy and cannot be deactivated here\./,
  );
  assert.match(
    action,
    /existing\.key === "merchant_knowledge" && existing\.active/,
  );
  assert.match(action, /systemRequired: false/);
});

test("Merchant Knowledge configuration is validated and mirrored as the same generic mapping", async () => {
  const action = await source("src/app/actions/merchant-pricing-plan.ts");
  const policy = await source(
    "src/lib/admin/merchant-knowledge-plan-policy.ts",
  );
  const persistence = await source(
    "src/lib/admin/merchant/merchant-pricing-plan-feature-persistence.ts",
  );
  assert.match(action, /ensureMerchantKnowledgeFeature\(\s*transaction/);
  assert.match(
    action,
    /transaction\.merchantKnowledgePurposeDataFormat\.findMany/,
  );
  assert.match(action, /validateMerchantKnowledgeConfiguration/);
  assert.match(action, /persistMerchantPricingPlanFeatures\(transaction/);
  assert.match(
    persistence,
    /transaction\.merchantPricingPlanFeature\.createMany/,
  );
  assert.match(persistence, /transaction\.billingPlanFeature\.upsert/);
  assert.match(persistence, /configuration,/);
  assert.match(persistence, /update: \{ enabled: true, configuration \}/);
  assert.match(
    policy,
    /configuration:\s*merchantKnowledgeConfiguration as Prisma\.InputJsonValue/,
  );
  assert.doesNotMatch(
    action,
    /shopFeaturePreference\.(?:create|update|delete)/i,
  );
  assert.doesNotMatch(action, /feature\.key\s*===\s*["']merchant_knowledge/);
  assert.doesNotMatch(
    persistence,
    /feature\.key\s*===\s*["']merchant_knowledge/,
  );
});

test("builder locks Merchant Knowledge and exposes only explicit active source options", async () => {
  const builder = await source(
    "src/components/admin/merchant/merchant-pricing-plan-builder.tsx",
  );
  const controls = await source(
    "src/lib/admin/merchant/pricing-plan-feature-controls.ts",
  );
  const pricing = await source("src/lib/admin/merchant/pricing-plan.ts");
  const catalogue = await source(
    "src/components/admin/merchant/merchant-pricing-plan-catalog.tsx",
  );
  assert.match(builder, /supportedFeatureControls\.map/);
  assert.match(builder, /checked=\{control\.checked\}/);
  assert.match(builder, /disabled=\{control\.disabled\}/);
  assert.match(controls, /checked: true/);
  assert.match(controls, /disabled: true/);
  assert.match(
    controls,
    /\.filter\(\(\{ key \}\) => key !== MERCHANT_KNOWLEDGE_FEATURE_KEY\)/,
  );
  assert.match(builder, /Included by product policy/);
  assert.match(builder, /Maximum knowledge sources/);
  assert.match(builder, /Maximum content units per source/);
  assert.match(builder, /merchantKnowledgeSourceTypes\.map/);
  assert.match(builder, /merchantKnowledgeConfigurationValid/);
  assert.match(pricing, /purpose: \{ active: true \}/);
  assert.match(pricing, /dataFormat: \{ active: true \}/);
  assert.match(pricing, /hasCurrentMerchantKnowledgeConfiguration/);
  assert.match(catalogue, /Merchant Knowledge configuration required/);
});

test("usage-event builder exposes currency-aware labels and blocks unbounded free events", async () => {
  const builder = await source(
    "src/components/admin/merchant/merchant-pricing-plan-builder.tsx",
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
  assert.match(builder, /Usage events \(\{events\.length}\/5\)/);
});

test("translation workbook keeps schema-v2 guidance and upload failures non-destructive", async () => {
  const workbook = await source(
    "src/components/admin/merchant/merchant-pricing-translation-workbook.tsx",
  );
  const dropzone = await source(
    "src/components/admin/translation-workbook-dropzone.tsx",
  );
  assert.match(workbook, /Download pre-populated translation spreadsheet/);
  assert.match(workbook, /processSelectedTranslationWorkbook/);
  assert.match(workbook, /TranslationWorkbookDropzone/);
  assert.match(dropzone, /Drop your completed \.xlsx spreadsheet here/);
  assert.match(dropzone, /Choose spreadsheet/);
  assert.match(dropzone, /type="file"/);
  assert.match(
    dropzone,
    /\.xlsx,application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/,
  );
  assert.match(dropzone, /Upload one spreadsheet at a time\./);
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
    "src/components/admin/merchant/merchant-pricing-plan-builder.tsx",
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

test("MerchantPricing catalogue pagination is database-backed and drawer context stays lean", async () => {
  const pricing = await source("src/lib/admin/merchant/pricing-plan.ts");
  const page = await source("src/app/(protected)/billing/page.tsx");
  const catalogue = await source(
    "src/components/admin/merchant/merchant-pricing-plan-catalog.tsx",
  );

  assert.match(
    pricing,
    /MERCHANT_PRICING_CATALOGUE_PAGE_SIZES = \[5, 10, 20, 50\]/,
  );
  assert.match(pricing, /merchantPricingPlan\.count\(\)/);
  assert.match(pricing, /skip: \(page - 1\) \* pageSize/);
  assert.match(pricing, /take: pageSize/);
  assert.match(
    pricing,
    /export async function getMerchantPricingCatalogueContext/,
  );
  assert.match(pricing, /where: \{ isActive: true \}/);
  assert.match(pricing, /translations: \[\]/);
  assert.match(pricing, /highlights: \[\]/);
  assert.match(page, /page: positiveInt\(rawParams\.planPage\)/);
  assert.match(page, /pageSize: positiveInt\(rawParams\.planPageSize, 5\)/);
  assert.match(page, /const cataloguePlans = planDrawerOpen/);
  assert.match(catalogue, /plans\.items\.map/);
  assert.match(catalogue, /name="planPageSize"/);
  assert.match(catalogue, /pageParam="planPage"/);
});
