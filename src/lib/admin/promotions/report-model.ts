export const PROMOTION_REPORT_PAGE_SIZE = 25;

export type PromotionMerchantRow = {
  shopId: string;
  shopLabel: string;
  firstSelectedAt: Date | null;
  lastSelectedAt: Date | null;
  selectionCount: number;
  quantityGranted: number;
  reserved: number;
  committed: number;
  remainingAllocation: number;
  firstUsedAt: Date | null;
  lastUsedAt: Date | null;
  exhaustedAt: Date | null;
  currentlySelected: boolean;
};

export type PromotionGrantProjectionInput = {
  shopId: string;
  shopLabel: string;
  quantity: number;
  reservedQuantity: number;
  committedQuantity: number;
  firstSelectedAt: Date | null;
  lastSelectedAt: Date | null;
  selectionCount: number;
  firstUsedAt: Date | null;
  lastUsedAt: Date | null;
  exhaustedAt: Date | null;
  selection: { id: string } | null;
};

export function normalizePromotionReportPage(value: number | undefined): number {
  return Number.isInteger(value) && value !== undefined && value > 0 ? value : 1;
}

export function normalizePromotionReportSearch(value: string | undefined): string | undefined {
  const search = value?.trim().slice(0, 255);
  return search || undefined;
}

export function projectPromotionMerchantRow(grant: PromotionGrantProjectionInput): PromotionMerchantRow {
  return {
    shopId: grant.shopId,
    shopLabel: grant.shopLabel,
    firstSelectedAt: grant.firstSelectedAt,
    lastSelectedAt: grant.lastSelectedAt,
    selectionCount: grant.selectionCount,
    quantityGranted: grant.quantity,
    reserved: grant.reservedQuantity,
    committed: grant.committedQuantity,
    remainingAllocation: Math.max(0, grant.quantity - grant.reservedQuantity - grant.committedQuantity),
    firstUsedAt: grant.firstUsedAt,
    lastUsedAt: grant.lastUsedAt,
    exhaustedAt: grant.exhaustedAt,
    currentlySelected: grant.selection !== null,
  };
}