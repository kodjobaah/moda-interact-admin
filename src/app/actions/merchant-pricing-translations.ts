"use server";

import {
  requirePlatformAdminMutation,
  requirePlatformAdminRead,
} from "@/lib/auth/platform-admin";
import {
  MERCHANT_PRICING_TRANSLATION_ERRORS,
  getMerchantPricingTranslationRunStatus,
  requestMerchantPricingTranslation,
  type MerchantPricingTranslationRunStatusView,
  type RequestMerchantPricingTranslationResult,
} from "@/lib/admin/merchant/merchant-pricing-translation-runs";

export type RequestMerchantPricingTranslationActionResult =
  | { ok: true; run: RequestMerchantPricingTranslationResult }
  | { ok: false; message: string; configurationRequired: boolean };

export type MerchantPricingTranslationStatusActionResult =
  | { ok: true; run: MerchantPricingTranslationRunStatusView }
  | { ok: false; message: string };

function inputObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Merchant Pricing translation request is invalid.");
  }
  return value as Record<string, unknown>;
}

function requestClientMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const allowed = new Set<string>([
    MERCHANT_PRICING_TRANSLATION_ERRORS.superAdminRequired,
    MERCHANT_PRICING_TRANSLATION_ERRORS.automaticNotConfigured,
    MERCHANT_PRICING_TRANSLATION_ERRORS.planNotFound,
    MERCHANT_PRICING_TRANSLATION_ERRORS.planHandleMismatch,
    MERCHANT_PRICING_TRANSLATION_ERRORS.existingPlanIdRequired,
    MERCHANT_PRICING_TRANSLATION_ERRORS.requestTimedOut,
    "Merchant Pricing translation state changed; retry the request.",
  ]);
  if (allowed.has(message) || message.startsWith("Merchant Pricing highlight ")) {
    return {
      message,
      configurationRequired:
        message === MERCHANT_PRICING_TRANSLATION_ERRORS.automaticNotConfigured,
    };
  }
  if (
    message === "Shopify plan handle is invalid." ||
    message === "Merchant Pricing English description is invalid." ||
    message === "Merchant Pricing highlights are invalid."
  ) {
    return { message, configurationRequired: false };
  }
  return {
    message:
      "The automatic Merchant Pricing translation request could not be created. Check the admin server logs and retry.",
    configurationRequired: false,
  };
}

export async function requestMerchantPricingTranslationAction(
  rawInput: unknown,
): Promise<RequestMerchantPricingTranslationActionResult> {
  try {
    const principal = await requirePlatformAdminMutation();
    if (principal.role !== "SUPER_ADMIN") {
      throw new Error(MERCHANT_PRICING_TRANSLATION_ERRORS.superAdminRequired);
    }
    const input = inputObject(rawInput);
    const run = await requestMerchantPricingTranslation(
      {
        merchantPricingPlanId: input.merchantPricingPlanId,
        shopifyPlanHandle: input.shopifyPlanHandle,
        englishDescription: input.englishDescription,
        highlights: input.highlights,
      },
      principal,
    );
    return { ok: true, run };
  } catch (error) {
    return { ok: false, ...requestClientMessage(error) };
  }
}

export async function getMerchantPricingTranslationStatusAction(
  rawRunId: unknown,
): Promise<MerchantPricingTranslationStatusActionResult> {
  try {
    await requirePlatformAdminRead();
    if (typeof rawRunId !== "string") {
      throw new Error(MERCHANT_PRICING_TRANSLATION_ERRORS.runNotFound);
    }
    return {
      ok: true,
      run: await getMerchantPricingTranslationRunStatus(rawRunId),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return {
      ok: false,
      message:
        message === MERCHANT_PRICING_TRANSLATION_ERRORS.runNotFound
          ? message
          : "Merchant Pricing translation status could not be loaded.",
    };
  }
}
