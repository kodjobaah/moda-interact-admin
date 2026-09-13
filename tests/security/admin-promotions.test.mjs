import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const action = fs.readFileSync(path.join(root, "src/app/actions/promotions.ts"), "utf8");
const validation = fs.readFileSync(path.join(root, "src/lib/admin/promotion-validation.ts"), "utf8");
const page = fs.readFileSync(path.join(root, "src/app/(protected)/promotions/page.tsx"), "utf8");
const sidebar = fs.readFileSync(path.join(root, "src/components/admin/sidebar.tsx"), "utf8");
const form = fs.readFileSync(path.join(root, "src/components/admin/promotion-campaign-form.tsx"), "utf8");
const data = fs.readFileSync(path.join(root, "src/lib/admin/promotions.ts"), "utf8");
const catalogue = fs.readFileSync(path.join(root, "src/lib/admin/promotion-catalogue.ts"), "utf8");
const lifecycle = fs.readFileSync(path.join(root, "src/lib/admin/promotion-campaign-lifecycle.ts"), "utf8");
const report = fs.readFileSync(path.join(root, "src/lib/admin/promotion-report.ts"), "utf8");
const reportPage = fs.readFileSync(path.join(root, "src/app/(protected)/promotions/[campaignId]/page.tsx"), "utf8");

test("promotion mutations are SUPER_ADMIN-only and use the platform admin guard", () => {
  assert.match(action, /requirePlatformAdminMutation/);
  assert.match(action, /principal\.role !== "SUPER_ADMIN"/);
  assert.match(page, /requirePlatformAdminPage/);
});

test("the promotions page gates target and campaign loading at the SUPER_ADMIN boundary", () => {
  assert.match(page, /const principal = await requirePlatformAdminPage\(\)/);
  assert.match(page, /import \{ redirect \} from "next\/navigation"/);
  assert.match(page, /if \(principal\.role !== "SUPER_ADMIN"\) redirect\("\/"\)/);
  const dataLoad = page.indexOf("const [{ plans, shops }, campaigns]");
  assert.ok(page.indexOf('principal.role !== "SUPER_ADMIN"') < dataLoad);
});

test("the promotions sidebar link is visible only to SUPER_ADMIN", () => {
  const promotionsLink = sidebar.match(/administratorRole === "SUPER_ADMIN"[\s\S]*?href="\/promotions"/);
  assert.ok(promotionsLink);
  assert.match(sidebar, /administratorRole === "SUPER_ADMIN" \? \(/);
});

test("campaign validation enforces all three exclusive target shapes", () => {
  assert.match(validation, /scope === "GLOBAL" && !targetPlanId && !targetShopId/);
  assert.match(validation, /scope === "PLAN" && Boolean\(targetPlanId\) && !targetShopId/);
  assert.match(validation, /scope === "SHOP" && !targetPlanId && Boolean\(targetShopId\)/);
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

test("activation form submits only the transition command", () => {
  const activationStart = form.indexOf("export function ActivatePromotionCampaignForm");
  const activationEnd = form.indexOf("export function ClosePromotionCampaignForm");
  const activationForm = form.slice(activationStart, activationEnd);
  assert.match(activationForm, /name="intent"/);
  assert.match(activationForm, /name="id"/);
  assert.doesNotMatch(activationForm, /name="(name|scope|quantity|targetPlanId|targetShopId|startsAt|expiresAt)"/);
});

test("draft editing uses the same versioned DRAFT compare-and-set", () => {
  assert.match(action, /status: PromotionCampaignStatus\.DRAFT,[\s\S]*version: existing\.version/);
  assert.match(action, /Promotion campaign changed; reload and retry/);
});

test("campaign activation never grants merchant credits or mutates selection capacity", () => {
  assert.doesNotMatch(action, /promotionalCreditGrant\.(create|createMany|upsert)/);
  assert.doesNotMatch(action, /merchantPromotionSelection\.(create|createMany|upsert)/);
  assert.doesNotMatch(action, /entitlementCounter\.(update|upsert|create)/);
  assert.doesNotMatch(action, /appEvent|shopify/i);
});

test("campaign history records creation and the UI exposes draft editing only", () => {
  assert.match(action, /kind: PromotionCampaignEventType\.CREATED/);
  assert.match(page, /campaign\.status === "DRAFT"/);
  assert.match(page, /Create optional merchant offers/);
});

test("catalogue retains lifecycle rows and derives bounded running state", () => {
  assert.match(data, /createdAt: true/);
  assert.match(data, /createdByPlatformAdmin/);
  assert.match(data, /lastLifecycleChange/);
  assert.match(catalogue, /now < campaign\.expiresAt/);
  assert.match(catalogue, /return "SCHEDULED"/);
  assert.match(data, /filters\.state/);
  assert.match(page, /name="state"/);
  assert.match(page, /name="scope"/);
  assert.match(page, /name="target"/);
});

test("close and reopen are SUPER_ADMIN-only versioned audited mutations", () => {
  assert.match(action, /intent === "close" \|\| intent === "reopen"/);
  assert.match(lifecycle, /status: existing\.status,[\s\S]*version: existing\.version/);
  assert.match(lifecycle, /PromotionCampaignEventType\.CLOSED/);
  assert.match(lifecycle, /PromotionCampaignEventType\.REOPENED/);
  assert.match(lifecycle, /PromotionCampaignEventType\.EXPIRY_CHANGED/);
  assert.match(lifecycle, /validatePromotionCampaignReopen/);
  assert.match(lifecycle, /Promotion campaign changed; reload and retry/);
  assert.match(lifecycle, /status: PromotionCampaignStatus\.CLOSED/);
  assert.match(lifecycle, /expiresAt,[\s\S]*version: \{ increment: 1 \}/);
  assert.doesNotMatch(action, /promotionalCreditGrant\.(create|createMany|upsert|update)/);
  assert.doesNotMatch(action, /merchantPromotionSelection\.(create|createMany|upsert|update)/);
  assert.doesNotMatch(action, /promotionCampaign\.(delete|deleteMany)/);
});

test("lifecycle forms expose close/reopen without allowing commercial-term edits", () => {
  assert.match(form, /ClosePromotionCampaignForm/);
  assert.match(form, /ReopenPromotionCampaignForm/);
  assert.match(form, /name="expiresAt" type="datetime-local"/);
  assert.doesNotMatch(form.slice(form.indexOf("export function ReopenPromotionCampaignForm")), /name="(quantity|scope|targetPlanId|targetShopId)"/);
});

test("campaign reports are SUPER_ADMIN-only, bounded, and read-only", () => {
  assert.match(report, /requirePlatformAdminRead/);
  assert.match(report, /principal\.role !== "SUPER_ADMIN"/);
  assert.match(report, /take: PROMOTION_REPORT_PAGE_SIZE/);
  assert.match(report, /skip: \(page - 1\) \* PROMOTION_REPORT_PAGE_SIZE/);
  assert.match(report, /shop: \{ domain: \{ contains: search, mode: "insensitive" \} \}/);
  assert.match(report, /firstUsedAt: \{ not: null \}/);
  assert.match(report, /exhaustedAt: \{ not: null \}/);
  assert.match(report, /currentlySelected: grant\.selection !== null/);
  assert.doesNotMatch(report, /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/);
  assert.match(reportPage, /requirePlatformAdminPage/);
  assert.match(reportPage, /principal\.role !== "SUPER_ADMIN"/);
  assert.match(reportPage, /name="status"/);
  assert.match(reportPage, /name="search"/);
  assert.doesNotMatch(reportPage, /PromotionCampaignForm|mutatePromotionCampaignAction/);
});