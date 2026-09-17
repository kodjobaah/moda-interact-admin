import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const action = fs.readFileSync(
  path.join(root, "src/app/actions/promotions.ts"),
  "utf8",
);
const validation = fs.readFileSync(
  path.join(root, "src/lib/admin/promotions/validation.ts"),
  "utf8",
);
const page = fs.readFileSync(
  path.join(root, "src/app/(protected)/promotions/page.tsx"),
  "utf8",
);
const sidebar = fs.readFileSync(
  path.join(root, "src/components/admin/sidebar.tsx"),
  "utf8",
);
const form = fs.readFileSync(
  path.join(root, "src/components/admin/promotions/promotion-campaign-form.tsx"),
  "utf8",
);
const catalog = fs.readFileSync(
  path.join(root, "src/components/admin/promotions/promotion-campaign-catalog.tsx"),
  "utf8",
);
const campaignActions = fs.readFileSync(
  path.join(root, "src/components/admin/promotions/promotion-campaign-actions.tsx"),
  "utf8",
);
const reactivation = fs.readFileSync(
  path.join(root, "src/components/admin/promotions/promotion-campaign-reactivation.tsx"),
  "utf8",
);
const reactivationDrawer = fs.readFileSync(
  path.join(root, "src/components/admin/promotions/promotion-campaign-reactivation-drawer.tsx"),
  "utf8",
);
const filters = fs.readFileSync(
  path.join(root, "src/components/admin/promotions/promotion-campaign-filters.tsx"),
  "utf8",
);
const drawer = fs.readFileSync(
  path.join(root, "src/components/admin/promotions/promotion-campaign-drawer.tsx"),
  "utf8",
);
const data = fs.readFileSync(
  path.join(root, "src/lib/admin/promotions/campaigns.ts"),
  "utf8",
);
const catalogue = fs.readFileSync(
  path.join(root, "src/lib/admin/promotions/catalogue.ts"),
  "utf8",
);
const lifecycle = fs.readFileSync(
  path.join(root, "src/lib/admin/promotions/lifecycle.ts"),
  "utf8",
);
const report = fs.readFileSync(
  path.join(root, "src/lib/admin/promotions/report.ts"),
  "utf8",
);
const reportModel = fs.readFileSync(
  path.join(root, "src/lib/admin/promotions/report-model.ts"),
  "utf8",
);
const reportPage = fs.readFileSync(
  path.join(root, "src/app/(protected)/promotions/[campaignId]/page.tsx"),
  "utf8",
);
const promotionTranslations = fs.readFileSync(
  path.join(root, "src/components/admin/promotions/promotion-translation-workbook.tsx"),
  "utf8",
);
const translationDropzone = fs.readFileSync(
  path.join(root, "src/components/admin/translation-workbook-dropzone.tsx"),
  "utf8",
);

test("promotion mutations are SUPER_ADMIN-only and use the platform admin guard", () => {
  assert.match(action, /requirePlatformAdminMutation/);
  assert.match(action, /principal\.role !== "SUPER_ADMIN"/);
  assert.match(page, /requirePlatformAdminPage/);
});

test("the promotions page gates target and campaign loading at the SUPER_ADMIN boundary", () => {
  assert.match(page, /const principal = await requirePlatformAdminPage\(\)/);
  assert.match(page, /import \{ redirect \} from "next\/navigation"/);
  assert.match(
    page,
    /if \(principal\.role !== "SUPER_ADMIN"\) redirect\("\/"\)/,
  );
  const dataLoad = page.indexOf("const campaignsPromise = getPromotionCampaigns");
  assert.ok(page.indexOf('principal.role !== "SUPER_ADMIN"') < dataLoad);
});

test("the promotions sidebar link is visible only to SUPER_ADMIN", () => {
  const promotionsLink = sidebar.match(
    /administratorRole === "SUPER_ADMIN"[\s\S]*?href="\/promotions"/,
  );
  assert.ok(promotionsLink);
  assert.match(sidebar, /administratorRole === "SUPER_ADMIN" \? \(/);
});

test("campaign validation enforces all three exclusive target shapes", () => {
  assert.match(
    validation,
    /scope === "GLOBAL" && !targetPlanId && !targetShopId/,
  );
  assert.match(
    validation,
    /scope === "PLAN" && Boolean\(targetPlanId\) && !targetShopId/,
  );
  assert.match(
    validation,
    /scope === "SHOP" && !targetPlanId && Boolean\(targetShopId\)/,
  );
  assert.match(action, /billingPlan\.findUnique/);
  assert.match(action, /shop\.findUnique/);
});

test("activation re-reads drafts, writes ACTIVATED evidence, and freezes terms", () => {
  assert.match(action, /status !== PromotionCampaignStatus\.DRAFT/);
  assert.match(action, /kind: PromotionCampaignEventType\.ACTIVATED/);
  assert.match(action, /Activated campaign terms are immutable/);
  assert.match(action, /promotionCampaign\.updateMany/);
  assert.match(action, /version: existing\.version/);
  assert.match(action, /if \(result\.count !== 1\)/);
  assert.match(action, /validatePromotionCampaignTerms\(currentValues\)/);
  assert.match(action, /version: \{ increment: 1 \}/);
});

test("catalogue lifecycle actions submit transition commands without commercial terms", () => {
  assert.match(campaignActions, /intent: "activate" \| "close"/);
  assert.match(campaignActions, /name="intent"/);
  assert.match(campaignActions, /name="id"/);
  assert.doesNotMatch(
    campaignActions,
    /name="(name|scope|quantity|targetPlanId|targetShopId|startsAt|expiresAt)"/,
  );
});

test("draft editing uses the same versioned DRAFT compare-and-set", () => {
  assert.match(
    action,
    /status: PromotionCampaignStatus\.DRAFT,[\s\S]*version: existing\.version/,
  );
  assert.match(action, /Promotion campaign changed; reload and retry/);
});

test("campaign activation never grants merchant credits or mutates selection capacity", () => {
  assert.doesNotMatch(
    action,
    /promotionalCreditGrant\.(create|createMany|upsert)/,
  );
  assert.doesNotMatch(
    action,
    /merchantPromotionSelection\.(create|createMany|upsert)/,
  );
  assert.doesNotMatch(action, /entitlementCounter\.(update|upsert|create)/);
  assert.doesNotMatch(action, /appEvent|shopify/i);
});

test("campaign history records creation and the UI exposes draft editing only", () => {
  assert.match(action, /kind: PromotionCampaignEventType\.CREATED/);
  assert.match(campaignActions, /const canEdit = campaign\.status === "DRAFT"/);
  assert.match(campaignActions, /Edit campaign/);
  assert.match(page, /Create optional merchant offers/);
});

test("promotion draft form rejects duplicate in-flight submissions synchronously", () => {
  assert.match(form, /useFormStatus/);
  assert.match(form, /form\.dataset\.submitting === "true"/);
  assert.match(form, /event\.preventDefault\(\)/);
  assert.match(form, /form\.dataset\.submitting = "true"/);
  assert.match(form, /delete form\.dataset\.submitting/);
  assert.match(form, /disabled=\{pending \|\| disabled\}/);
  assert.match(form, /"Creating…"/);
  assert.match(form, /"Saving…"/);
});

test("catalogue retains lifecycle rows and derives bounded running state", () => {
  assert.match(data, /createdAt: true/);
  assert.match(data, /createdByPlatformAdmin/);
  assert.match(data, /lastLifecycleChange/);
  assert.match(catalogue, /now < campaign\.expiresAt/);
  assert.match(catalogue, /return "SCHEDULED"/);
  assert.match(data, /promotionCampaign\.count/);
  assert.match(data, /skip: \(page - 1\) \* pageSize/);
  assert.match(data, /take: pageSize/);
  assert.match(catalogue, /case "RUNNING"/);
  assert.match(catalogue, /expiresAt: \{ gt: now \}/);
  assert.match(filters, /name="state"/);
  assert.match(filters, /name="scope"/);
  assert.match(filters, /name="target"/);
});

test("close and reopen are SUPER_ADMIN-only versioned audited mutations", () => {
  assert.match(action, /intent === "close" \|\| intent === "reopen"/);
  assert.match(
    lifecycle,
    /status: existing\.status,[\s\S]*version: existing\.version/,
  );
  assert.match(lifecycle, /PromotionCampaignEventType\.CLOSED/);
  assert.match(lifecycle, /PromotionCampaignEventType\.REOPENED/);
  assert.match(lifecycle, /PromotionCampaignEventType\.EXPIRY_CHANGED/);
  assert.match(lifecycle, /validatePromotionCampaignReopen/);
  assert.match(lifecycle, /Promotion campaign changed; reload and retry/);
  assert.match(lifecycle, /status: PromotionCampaignStatus\.CLOSED/);
  assert.match(lifecycle, /expiresAt,[\s\S]*version: \{ increment: 1 \}/);
  assert.doesNotMatch(
    action,
    /promotionalCreditGrant\.(create|createMany|upsert|update)/,
  );
  assert.doesNotMatch(
    action,
    /merchantPromotionSelection\.(create|createMany|upsert|update)/,
  );
  assert.doesNotMatch(action, /promotionCampaign\.(delete|deleteMany)/);
});

test("catalogue lifecycle controls use edit/activate/deactivate/reactivate semantics", () => {
  assert.match(campaignActions, /Edit campaign/);
  assert.match(campaignActions, /label="Activate"/);
  assert.match(campaignActions, /label="Deactivate"/);
  assert.match(campaignActions, /Close draft/);
  assert.match(campaignActions, /Reactivate/);
  assert.match(campaignActions, /drawer: "reactivate"/);
  assert.match(reactivation, /name="expiresAt"/);
  assert.match(reactivation, /type="datetime-local"/);
  assert.match(reactivation, /required=\{requiresNewExpiry\}/);
  assert.match(reactivation, /Leave this blank to keep the current expiry/);
  assert.match(reactivation, /reactivatePromotionCampaignAction/);
  assert.match(reactivation, /role="alert"/);
  assert.match(reactivation, /Save and reactivate/);
  assert.match(reactivation, /Reactivate/);
  assert.doesNotMatch(
    reactivation,
    /name="(quantity|scope|targetPlanId|targetShopId|startsAt)"/,
  );
  assert.match(reactivationDrawer, /AdminDetailDrawer/);
  assert.match(page, /drawerMode === "reactivate"/);
  assert.match(page, /PromotionCampaignReactivationDrawer/);
  assert.match(action, /returnTo\.startsWith\("\/promotions"\)/);
});

test("promotion translations use the shared drag-and-drop workbook control", () => {
  assert.match(promotionTranslations, /TranslationWorkbookDropzone/);
  assert.match(
    promotionTranslations,
    /already contains all 20 supported languages, the English merchant title/,
  );
  assert.match(
    translationDropzone,
    /Drop your completed \.xlsx spreadsheet here/,
  );
  assert.match(translationDropzone, /Choose spreadsheet/);
  assert.match(translationDropzone, /Upload one spreadsheet at a time\./);
});

test("promotion draft and all translations are saved atomically", () => {
  assert.match(form, /name="translationJson"/);
  assert.match(form, /NEW_PROMOTION_TRANSLATION_CAMPAIGN_ID/);
  assert.match(form, /translationsReady/);
  assert.match(
    form,
    /Complete and upload all 20 merchant translations before saving/,
  );
  assert.doesNotMatch(promotionTranslations, /<form action=/);
  assert.doesNotMatch(action, /importPromotionTranslationsAction/);
  assert.match(action, /parseCompletedPromotionTranslationPackage/);
  assert.match(action, /Object\.entries\(completedTranslations\)/);
  assert.match(
    action,
    /promotionCampaign\.create\([\s\S]*translations: \{[\s\S]*create:/,
  );
  assert.match(action, /promotionCampaignTranslation\.createMany/);
});

test("promotion catalogue uses a URL-driven drawer and bounded server pagination", () => {
  assert.match(page, /PromotionCampaignDrawer/);
  assert.match(page, /const drawerMode = firstParam\(rawParams\.drawer\)/);
  assert.match(page, /const register = drawerMode === "create"/);
  assert.match(page, /firstParam\(rawParams\.campaignId\)/);
  assert.match(page, /getPromotionCampaignById/);
  assert.match(drawer, /AdminDetailDrawer/);
  assert.match(drawer, /size="wide"/);
  assert.match(catalog, /max-h-\[calc\(100vh-20rem\)\]/);
  assert.match(catalog, /overflow-y-auto/);
  assert.match(catalog, /sticky bottom-0/);
  assert.match(catalog, /<Pagination/);
  assert.match(catalog, /Campaigns per page/);
  assert.match(catalog, /PROMOTION_CATALOGUE_PAGE_SIZES/);
  assert.match(catalog, /Pagination/);
  assert.match(catalogue, /\[5, 10, 20, 50\]/);
  assert.doesNotMatch(data, /\.filter\(\s*\(campaign\)/);
});

test("campaign reports are SUPER_ADMIN-only, bounded, and read-only", () => {
  assert.match(report, /requirePlatformAdminRead/);
  assert.match(report, /principal\.role !== "SUPER_ADMIN"/);
  assert.match(report, /take: PROMOTION_REPORT_PAGE_SIZE/);
  assert.match(report, /skip: \(page - 1\) \* PROMOTION_REPORT_PAGE_SIZE/);
  assert.match(
    report,
    /shop: \{ domain: \{ contains: search, mode: "insensitive" \} \}/,
  );
  assert.match(report, /firstUsedAt: \{ not: null \}/);
  assert.match(report, /exhaustedAt: \{ not: null \}/);
  assert.match(reportModel, /currentlySelected: grant\.selection !== null/);
  assert.doesNotMatch(
    report,
    /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/,
  );
  assert.match(reportPage, /requirePlatformAdminPage/);
  assert.match(reportPage, /principal\.role !== "SUPER_ADMIN"/);
  assert.match(reportPage, /name="status"/);
  assert.match(reportPage, /name="search"/);
  assert.match(reportPage, /lastSelectedAt/);
  assert.match(reportPage, /lastUsedAt/);
  assert.match(reportPage, />Previous</);
  assert.match(reportPage, />Next</);
  assert.match(reportPage, /reportPageHref\(report\.page - 1\)/);
  assert.match(reportPage, /reportPageHref\(report\.page \+ 1\)/);
  assert.match(reportPage, /params\.set\("search", search\)/);
  assert.match(
    reportPage,
    /params = new URLSearchParams\(\{ page: String\(page\), status \}\)/,
  );
  assert.doesNotMatch(
    reportPage,
    /PromotionCampaignForm|mutatePromotionCampaignAction/,
  );
});
