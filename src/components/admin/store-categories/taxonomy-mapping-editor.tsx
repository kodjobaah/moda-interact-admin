import { mutateStoreCategoryCatalogueAction } from "@/app/actions/store-categories";
import type { StoreCategoryCatalogue } from "@/lib/admin/store-categories";
import { ShopifyTaxonomyPicker } from "./shopify-taxonomy-picker";

type Category = StoreCategoryCatalogue["categories"][number];
const inputClass =
  "mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)]";

export function TaxonomyMappingEditor({
  category,
  categories,
}: {
  category: Category;
  categories: Category[];
}) {
  return (
    <section aria-labelledby="shopify-taxonomy-mappings-title">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h3
            id="shopify-taxonomy-mappings-title"
            className="text-lg font-semibold text-gray-950"
          >
            Shopify taxonomy mappings
          </h3>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Select categories from Shopify&apos;s standardized product taxonomy. During
            onboarding, matching mapping weights are summed for each Store Category;
            the highest score wins. The merchant can still change the suggestion.
          </p>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
          {category.taxonomyMappings.length} mapping
          {category.taxonomyMappings.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h4 className="text-sm font-semibold text-gray-900">Add mapping</h4>
        <p className="mt-1 text-xs text-gray-600">
          Search by a familiar Shopify category name or browse the hierarchy. Moda
          stores the exact Shopify taxonomy GID after selection.
        </p>
        <form action={mutateStoreCategoryCatalogueAction} className="mt-4 space-y-4">
          <input type="hidden" name="intent" value="create-taxonomy-mapping" />
          <input type="hidden" name="categoryId" value={category.id} />
          <ShopifyTaxonomyPicker
            id={`create-taxonomy-${category.id}`}
            name="shopifyTaxonomyCategoryId"
            required
          />
          <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end">
            <label className="text-sm font-medium text-gray-700">
              Suggestion weight
              <input
                className={inputClass}
                name="weight"
                type="number"
                min={1}
                max={1_000_000}
                defaultValue={1}
                required
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Audit reason
              <input className={inputClass} name="reason" maxLength={1000} required />
            </label>
            <button
              className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]"
              type="submit"
            >
              Add mapping
            </button>
          </div>
        </form>
      </div>

      {category.taxonomyMappings.length === 0 ? (
        <div className="mt-5 rounded-md border border-dashed border-gray-300 p-6 text-sm text-gray-600">
          No Shopify taxonomy mappings yet. Mappings are optional and can be added at
          any time.
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {category.taxonomyMappings.map((mapping) => (
            <article
              key={mapping.id}
              className="rounded-lg border border-gray-200 bg-white p-4"
            >
              <form action={mutateStoreCategoryCatalogueAction} className="space-y-4">
                <input type="hidden" name="intent" value="update-taxonomy-mapping" />
                <input type="hidden" name="id" value={mapping.id} />
                <ShopifyTaxonomyPicker
                  id={`taxonomy-${mapping.id}`}
                  name="shopifyTaxonomyCategoryId"
                  defaultValue={mapping.shopifyTaxonomyCategoryId}
                  required
                />
                <div className="grid gap-3 lg:grid-cols-[minmax(12rem,1fr)_10rem_minmax(0,2fr)_auto] lg:items-end">
                  <label className="text-sm font-medium text-gray-700">
                    Store Category
                    <select
                      className={inputClass}
                      name="categoryId"
                      defaultValue={mapping.categoryId}
                    >
                      {categories.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-gray-700">
                    Suggestion weight
                    <input
                      className={inputClass}
                      name="weight"
                      type="number"
                      min={1}
                      max={1_000_000}
                      defaultValue={mapping.weight}
                      required
                    />
                  </label>
                  <label className="text-sm font-medium text-gray-700">
                    Audit reason
                    <input className={inputClass} name="reason" maxLength={1000} required />
                  </label>
                  <button
                    className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                    type="submit"
                  >
                    Save mapping
                  </button>
                </div>
              </form>

              <form
                action={mutateStoreCategoryCatalogueAction}
                className="mt-4 flex flex-col gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:items-end sm:justify-end"
              >
                <input type="hidden" name="intent" value="remove-taxonomy-mapping" />
                <input type="hidden" name="id" value={mapping.id} />
                <label className="w-full text-sm font-medium text-gray-700 sm:max-w-xl">
                  Removal audit reason
                  <input
                    className={inputClass}
                    name="reason"
                    maxLength={1000}
                    placeholder="Why is this mapping being removed?"
                    required
                  />
                </label>
                <button
                  className="rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-50"
                  type="submit"
                >
                  Remove mapping
                </button>
              </form>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
