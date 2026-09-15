type BuilderUsageEvent = {
  adminLabel: string;
  pricingMode: "FIXED" | "GRADUATED" | "VOLUME";
  creditsGrantedPerUnit: number;
  maximumUnitsPerBillingPeriod: number | null;
  fixedUnitAmount?: string;
  tiers?: Array<{
    upTo: number | null;
    amountPerUnit: string;
    flatAmount: string;
  }>;
};

type MoneyParser = (value: string) => number;

export function findUnboundedZeroCostEventLabel(
  events: BuilderUsageEvent[],
  parseMoney: MoneyParser,
): string | null {
  const event = events.find((candidate) => {
    if (
      candidate.creditsGrantedPerUnit <= 0 ||
      candidate.maximumUnitsPerBillingPeriod !== null
    ) {
      return false;
    }

    try {
      if (candidate.pricingMode === "FIXED") {
        return parseMoney(candidate.fixedUnitAmount ?? "") === 0;
      }

      const tiers = candidate.tiers ?? [];
      if (!tiers.length) return false;
      if (candidate.pricingMode === "VOLUME") {
        const finalTier = tiers[tiers.length - 1];
        return (
          finalTier.upTo === null &&
          parseMoney(finalTier.amountPerUnit) === 0 &&
          parseMoney(finalTier.flatAmount) === 0
        );
      }

      return tiers.every(
        (tier) =>
          parseMoney(tier.amountPerUnit) === 0 &&
          parseMoney(tier.flatAmount) === 0,
      );
    } catch {
      return false;
    }
  });

  return event?.adminLabel.trim() || null;
}