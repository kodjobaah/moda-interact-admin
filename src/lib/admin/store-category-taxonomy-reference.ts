export const STORE_CATEGORY_REFERENCE_TAXONOMY_SOURCE =
  "SHOPIFY_STANDARD_PRODUCT_TAXONOMY" as const;

export type StoreCategoryTaxonomyReference = {
  source: typeof STORE_CATEGORY_REFERENCE_TAXONOMY_SOURCE;
  version: string;
  categoryId: string;
  name: string;
  fullName: string;
};

export function isStoreCategoryTaxonomyReference(
  value: StoreCategoryTaxonomyReference | null | undefined,
): value is StoreCategoryTaxonomyReference {
  return Boolean(
    value &&
      value.source === STORE_CATEGORY_REFERENCE_TAXONOMY_SOURCE &&
      value.version.trim() &&
      value.categoryId.trim() &&
      value.name.trim() &&
      value.fullName.trim(),
  );
}
