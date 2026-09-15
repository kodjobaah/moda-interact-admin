import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { test } from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const policyValidation = readFileSync(
  resolve(root, "src/lib/admin/billing-control-validation.ts"),
  "utf8",
);
const controls = readFileSync(
  resolve(root, "src/components/admin/billing-controls.tsx"),
  "utf8",
);
const policyAction = readFileSync(
  resolve(root, "src/app/actions/billing-controls.ts"),
  "utf8",
);
const controlsPage = readFileSync(
  resolve(root, "src/app/(protected)/billing/controls/page.tsx"),
  "utf8",
);
const billingPage = readFileSync(
  resolve(root, "src/app/(protected)/billing/page.tsx"),
  "utf8",
);
const shell = readFileSync(
  resolve(root, "src/components/admin/admin-shell.tsx"),
  "utf8",
);
const tenantDirectory = readFileSync(
  resolve(root, "src/app/(protected)/page.tsx"),
  "utf8",
);
const searchInput = readFileSync(
  resolve(root, "src/components/admin/search-input.tsx"),
  "utf8",
);
const merchantPricingEconomics = readFileSync(
  resolve(root, "src/lib/admin/merchant-pricing-economics.ts"),
  "utf8",
);
const guardrail = readFileSync(
  resolve(root, "src/lib/admin/upgrade-economics-guardrail.ts"),
  "utf8",
);
const guardrailTests = readFileSync(
  resolve(root, "tests/unit/upgrade-economics-guardrail.test.ts"),
  "utf8",
);

function assertMissing(path) {
  assert.equal(existsSync(resolve(root, path)), false);
}

test("superseded economics application surfaces are deleted", () => {
  for (const path of [
    "src/app/actions/billing-economics.ts",
    "src/lib/admin/billing-economics.ts",
    "src/lib/admin/billing-economics-validation.ts",
    "src/lib/admin/billing-plan-guardrail.ts",
  ])
    assertMissing(path);
});

test("policy threshold is bounded and persisted through the existing policy action", () => {
  assert.match(policyValidation, /minimumUpgradePremiumBps/);
  assert.match(policyValidation, /10_000/);
  assert.match(
    policyAction,
    /minimumUpgradePremiumBps: values\.minimumUpgradePremiumBps/,
  );
  assert.match(controls, /name="minimumUpgradePremiumBps"/);
});

test("retained controls remove the legacy economics forms", () => {
  for (const source of [controlsPage, billingPage]) {
    assert.doesNotMatch(
      source,
      /BillingEconomicsControls|getBillingEconomicsControls/,
    );
  }
  assert.doesNotMatch(controls, /Upgrade ladder/);
  assert.doesNotMatch(controls, /Verified Shopify App Pricing economics/);
  assert.doesNotMatch(
    controls,
    /mutateUpgradeEdgeAction|recordEconomicsSnapshotAction/,
  );
  assert.match(controlsPage, /PlatformBillingControls/);
});

test("retained platform policy persists the bounded premium threshold", () => {
  assert.match(policyValidation, /minimumUpgradePremiumBps/);
  assert.match(policyValidation, /10_000/);
  assert.match(
    policyAction,
    /minimumUpgradePremiumBps: values\.minimumUpgradePremiumBps/,
  );
  assert.match(controls, /name="minimumUpgradePremiumBps"/);
});

test("generic economics guardrail remains live for MerchantPricing", () => {
  assert.match(guardrail, /export function validateSinglePackShopifyEconomics/);
  assert.match(guardrailTests, /validateSinglePackShopifyEconomics/);
  assert.match(merchantPricingEconomics, /minimumUpgradePremiumBps/);
});

test("AdminShell only renders supplied headers and tenant search stays on the directory", () => {
  assert.match(shell, /header\?: ReactNode/);
  assert.match(shell, /\{header \? \(/);
  assert.doesNotMatch(shell, /SearchInput|search\?: string/);
  assert.match(tenantDirectory, /import \{ SearchInput \}/);
  assert.match(tenantDirectory, /header=\{/);
  assert.match(tenantDirectory, /<SearchInput defaultValue=\{search\} \/>/);
  assert.match(searchInput, /<form action="\/" method="get"/);
  assert.match(searchInput, /name="q"/);
});

test("non-directory pages do not wire tenant SearchInput", () => {
  for (const path of [
    "src/app/(protected)/billing/page.tsx",
    "src/app/(protected)/billing/controls/page.tsx",
    "src/app/(protected)/promotions/page.tsx",
    "src/app/(protected)/promotions/[campaignId]/page.tsx",
    "src/app/(protected)/merchant-support/page.tsx",
    "src/app/(protected)/observability/page.tsx",
    "src/app/(protected)/observability/queues/page.tsx",
  ]) {
    assert.doesNotMatch(
      readFileSync(resolve(root, path), "utf8"),
      /SearchInput|search\.tenantsPlaceholder/,
    );
  }
});
