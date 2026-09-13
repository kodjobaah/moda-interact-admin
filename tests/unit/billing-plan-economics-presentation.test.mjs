import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const presentation = await import(
  pathToFileURL(
    resolve(
      root,
      "src/components/admin/billing-plan-economics-presentation.ts",
    ),
  ).href
);
const guardrail = await import(
  pathToFileURL(resolve(root, "src/lib/admin/billing-plan-guardrail.ts")).href
);

const plans = {
  lower: {
    id: "lower",
    name: "Starter",
    kind: "PAID_METERED",
    active: true,
    includedRecoveryConversationAllowance: 100,
    recoveryCreditPackEnabled: true,
    recoveryCreditsPerPack: 50,
    shopifyRecoveryCreditPackEventHandle: "starter-pack",
  },
  higher: {
    id: "higher",
    name: "Growth",
    kind: "PAID_METERED",
    active: true,
    includedRecoveryConversationAllowance: 400,
    recoveryCreditPackEnabled: false,
    recoveryCreditsPerPack: null,
    shopifyRecoveryCreditPackEventHandle: null,
  },
};

function snapshot(unitAmountMinor = 2000) {
  return {
    id: "snapshot-lower",
    monthlyRecurringAmountMinor: 5000,
    currency: "GBP",
    recoveryCreditPackEnabledSnapshot: true,
    recoveryCreditsPerPackSnapshot: 50,
    shopifyRecoveryCreditPackEventHandleSnapshot: "starter-pack",
    usagePricingSnapshot: {
      mode: "FIXED",
      currency: "GBP",
      unitAmountMinor,
    },
  };
}

function evaluate(unitAmountMinor, lowerSnapshot = snapshot(unitAmountMinor)) {
  return guardrail.evaluateBillingUpgradeEdge({
    edge: { id: "edge", lowerPlanId: "lower", higherPlanId: "higher" },
    lowerPlan: plans.lower,
    higherPlan: plans.higher,
    lowerSnapshot,
    higherSnapshot: {
      id: "snapshot-higher",
      monthlyRecurringAmountMinor: 7500,
      currency: "GBP",
      recoveryCreditPackEnabledSnapshot: false,
      recoveryCreditsPerPackSnapshot: null,
      shopifyRecoveryCreditPackEventHandleSnapshot: null,
      usagePricingSnapshot: null,
    },
    minimumUpgradePremiumBps: 2000,
  });
}

function markup(evaluations) {
  return renderToStaticMarkup(
    React.createElement(presentation.EconomicsExplanation, { evaluations }),
  );
}

test("renders PASS, FAIL, and UNVERIFIED evidence with exact integer-minor currency", () => {
  const pass = markup([evaluate(2000)]);
  const fail = markup([evaluate(500)]);
  const unverified = markup([evaluate(2000, null)]);

  assert.match(pass, /Starter/);
  assert.match(pass, /Growth/);
  assert.match(pass, /300/);
  assert.match(pass, /6 x 50/);
  assert.match(pass, /GBP 170\.00/);
  assert.match(pass, /GBP 75\.00/);
  assert.match(pass, /126\.7%/);
  assert.match(pass, /20\.0%/);
  assert.match(pass, /PASS/);
  assert.match(fail, /FAIL/);
  assert.match(fail, /300/);
  assert.match(fail, /6 x 50/);
  assert.match(fail, /activation|blocked/i);
  assert.match(unverified, /UNVERIFIED/);
  assert.doesNotMatch(unverified, /PASS/);
  assert.match(unverified, /latest verified Shopify evidence/i);
});

test("renders NO_UPGRADE_EDGE from configured plans and complete authority wording", () => {
  const evaluations = [evaluate(2000)];
  const noEdgeMarkup = renderToStaticMarkup(
    React.createElement(presentation.NoUpgradeEdgeNotice, {
      plans: [
        plans.lower,
        plans.higher,
        { ...plans.higher, id: "scale", name: "Scale" },
      ],
      evaluations,
    }),
  );
  const evidenceMarkup = markup(evaluations);

  assert.match(noEdgeMarkup, /NO_UPGRADE_EDGE/);
  assert.match(noEdgeMarkup, /Scale/);
  assert.doesNotMatch(
    noEdgeMarkup,
    /invented|higher plan is configured for Growth/,
  );
  assert.match(
    evidenceMarkup,
    /Verified Shopify economics evidence used by the Admin guardrail/,
  );
  assert.match(evidenceMarkup, /does not authorize Shopify charging/);
  assert.doesNotMatch(
    evidenceMarkup + noEdgeMarkup,
    /TEST_ACCESS_TOKEN_123|TEST_PARTNER_SECRET_456|TEST_RAW_PROVIDER_RESPONSE_789/,
  );
});
