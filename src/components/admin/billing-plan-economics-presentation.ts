import React from "react";
import { createInternationalizationRuntime } from "@modainteract/moda-interact-shared/internationalization";
import catalogue from "../../i18n/locales/en.json" with { type: "json" };
import type { BillingPlanRow } from "../../lib/admin/billing-plan";
import {
  billingUpgradeTopUpPath,
  type EvaluatedBillingUpgradeEdge,
} from "../../lib/admin/billing-plan-guardrail.ts";

const adminI18n = createInternationalizationRuntime({
  locale: "en",
  catalogue,
  timeZone: "UTC",
});

function text(value: unknown) {
  return String(value);
}

function money(minor: number | undefined, currency: string | undefined) {
  return minor === undefined
    ? adminI18n.t("empty.notRecorded")
    : `${currency ?? ""} ${(minor / 100).toFixed(2)}`.trim();
}

export function EconomicsExplanation({
  evaluations,
}: {
  evaluations: EvaluatedBillingUpgradeEdge[];
}) {
  if (!evaluations.length) return null;
  return React.createElement(
    "section",
    { "data-testid": "billing-economics" },
    React.createElement("h2", null, adminI18n.t("billing.upgradeEconomics")),
    React.createElement(
      "p",
      null,
      adminI18n.t("billing.verifiedShopifyEvidence"),
    ),
    ...evaluations.map((evaluation) => {
      const { details } = evaluation.result;
      const topUpPath = billingUpgradeTopUpPath(evaluation);
      const currency = evaluation.lowerSnapshot?.currency;
      const statusKey =
        evaluation.result.status === "PASS"
          ? "billing.pass"
          : evaluation.result.status === "FAIL"
            ? "billing.fail"
            : "billing.unverified";
      const explanationKey =
        evaluation.result.status === "PASS"
          ? "billing.guardrailPass"
          : evaluation.result.code === "CURRENCY_MISMATCH"
            ? "billing.guardrailCurrencyMismatch"
            : evaluation.result.code === "INVALID_USAGE_PRICING"
              ? "billing.guardrailInvalidUsagePricing"
              : evaluation.result.code === "TOPUP_PRICING_UNAVAILABLE"
                ? "billing.guardrailMissingTopUpEvidence"
                : evaluation.result.code === "INVALID_TOPUP_CONFIGURATION"
                  ? "billing.guardrailInvalidTopUpConfiguration"
                  : evaluation.result.code === "MISSING_PLAN_PRICE"
                    ? "billing.guardrailMissingPlanEvidence"
                    : evaluation.result.code === "INVALID_UPGRADE_EDGE"
                      ? "billing.guardrailInvalidUpgradeEdge"
                      : "billing.guardrailBlocked";
      const field = (label: string, value: unknown) =>
        React.createElement(
          "div",
          { key: label },
          React.createElement("dt", null, adminI18n.t(label)),
          React.createElement("dd", null, text(value)),
        );
      return React.createElement(
        "article",
        { key: evaluation.edge.id },
        React.createElement(
          "h3",
          null,
          `${evaluation.lowerPlan.name} -> ${evaluation.higherPlan.name}`,
        ),
        React.createElement(
          "strong",
          null,
          `${evaluation.result.status} - ${adminI18n.t(statusKey)}`,
        ),
        React.createElement(
          "dl",
          null,
          field(
            "billing.capacityGap",
            adminI18n.formatNumber(details.additionalCreditsNeeded),
          ),
          field(
            "billing.topUpPath",
            topUpPath.length
              ? topUpPath
                  .map(
                    (pack) =>
                      `${adminI18n.formatNumber(pack.quantity)} x ${adminI18n.formatNumber(pack.creditsGranted)}`,
                  )
                  .join(", ")
              : adminI18n.t("billing.noTopUpPath"),
          ),
          field(
            "billing.requiredPackUnits",
            details.packUnitsNeeded === undefined
              ? adminI18n.t("empty.notRecorded")
              : adminI18n.formatNumber(details.packUnitsNeeded),
          ),
          field(
            "billing.stayAndTopUps",
            money(details.stayAndTopUpCostMinor, currency),
          ),
          field(
            "billing.upgradeCost",
            money(details.upgradeCostMinor, currency),
          ),
          field(
            "billing.premium",
            details.premiumBps === undefined
              ? adminI18n.t("empty.notRecorded")
              : `${(details.premiumBps / 100).toFixed(1)}%`,
          ),
          field(
            "billing.requiredPremium",
            `${(evaluation.minimumUpgradePremiumBps / 100).toFixed(1)}%`,
          ),
        ),
        React.createElement(
          "p",
          null,
          adminI18n.t(explanationKey, { code: evaluation.result.code }),
        ),
        React.createElement(
          "p",
          null,
          adminI18n.t("billing.guardrailCode", {
            code: evaluation.result.code,
          }),
        ),
      );
    }),
  );
}

export function NoUpgradeEdgeNotice({
  plans,
  evaluations,
}: {
  plans: BillingPlanRow[];
  evaluations: EvaluatedBillingUpgradeEdge[];
}) {
  const lowerPlanIds = new Set(evaluations.map(({ edge }) => edge.lowerPlanId));
  const plansWithoutNextEdge = plans.filter(
    (plan) => !lowerPlanIds.has(plan.id),
  );
  if (!plansWithoutNextEdge.length) return null;
  return React.createElement(
    "section",
    { "data-testid": "no-upgrade-edge" },
    React.createElement("h2", null, adminI18n.t("billing.noUpgradeEdgeTitle")),
    React.createElement(
      "ul",
      null,
      ...plansWithoutNextEdge.map((plan) =>
        React.createElement(
          "li",
          { key: plan.id },
          `${plan.name}: ${adminI18n.t("billing.noUpgradeEdge")}`,
        ),
      ),
    ),
  );
}
