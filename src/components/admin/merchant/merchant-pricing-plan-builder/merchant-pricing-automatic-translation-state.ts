import type { MerchantPricingBuilderHighlight } from "../../../../lib/admin/merchant/pricing-builder-payload.ts";

export type MerchantPricingAutomaticTranslationRunView = {
  runId: string;
  status:
    | "PENDING"
    | "PROCESSING"
    | "READY_TO_APPLY"
    | "APPLIED"
    | "FAILED"
    | "STALE";
  modelDisplayName: string;
  completeLocaleCount: number;
  localeCount: number;
  pendingItemCount: number;
  failedItemCount: number;
  failureCode: string | null;
};

export function merchantPricingAutomaticTranslationSourceKey(input: {
  shopifyPlanHandle: string;
  englishDescription: string;
  highlights: MerchantPricingBuilderHighlight[];
}): string {
  return JSON.stringify({
    shopifyPlanHandle: input.shopifyPlanHandle.trim(),
    englishDescription: input.englishDescription.trim(),
    highlights: [...input.highlights]
      .map((highlight) => ({
        contentKey: highlight.contentKey.trim(),
        title: highlight.title.trim(),
        description: highlight.description.trim(),
      }))
      .sort((left, right) => left.contentKey.localeCompare(right.contentKey)),
  });
}

export function merchantPricingAutomaticTranslationReady(
  run: MerchantPricingAutomaticTranslationRunView | null,
): boolean {
  return Boolean(
    run &&
      run.status === "READY_TO_APPLY" &&
      run.localeCount > 0 &&
      run.completeLocaleCount === run.localeCount &&
      run.pendingItemCount === 0 &&
      run.failedItemCount === 0,
  );
}

export function merchantPricingAutomaticTranslationTerminal(
  run: MerchantPricingAutomaticTranslationRunView | null,
): boolean {
  return Boolean(
    run && ["READY_TO_APPLY", "APPLIED", "FAILED", "STALE"].includes(run.status),
  );
}
