export const TENANT_BILLING_ACTIVITY_PAGE_SIZES = [5, 10, 20, 50] as const;
export const DEFAULT_TENANT_BILLING_ACTIVITY_PAGE_SIZE = 10;

export function parseTenantBillingActivityPageSize(
  value: string | undefined,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return TENANT_BILLING_ACTIVITY_PAGE_SIZES.includes(
    parsed as (typeof TENANT_BILLING_ACTIVITY_PAGE_SIZES)[number],
  )
    ? parsed
    : DEFAULT_TENANT_BILLING_ACTIVITY_PAGE_SIZE;
}
