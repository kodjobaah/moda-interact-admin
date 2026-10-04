import { mutateStoreCategoryCatalogueAction } from "@/app/actions/store-categories";
import type { StoreCategoryCatalogue } from "@/lib/admin/store-categories";

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
      <h3 id="shopify-taxonomy-mappings-title" className="text-lg font-semibold text-gray-950">Shopify taxonomy mappings</h3>
      <form
        action={mutateStoreCategoryCatalogueAction}
        className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,2fr)_8rem_minmax(0,2fr)_auto]"
      >
        <input type="hidden" name="intent" value="create-taxonomy-mapping" />
        <input type="hidden" name="categoryId" value={category.id} />
        <label className="text-sm font-medium text-gray-700">
          Shopify taxonomy category ID
          <input
            className={inputClass}
            name="shopifyTaxonomyCategoryId"
            maxLength={255}
            required
          />
        </label>
        <label className="text-sm font-medium text-gray-700">
          Weight
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
        <div className="flex items-end">
          <button
            className="w-full rounded-md bg-[var(--brand-700)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]"
            type="submit"
          >
            Add mapping
          </button>
        </div>
      </form>
      {category.taxonomyMappings.length === 0 ? (
        <p className="mt-4 text-sm text-gray-600">No taxonomy mappings.</p>
      ) : (
        <div className="mt-5 divide-y divide-gray-200 border-y border-gray-200">
          {category.taxonomyMappings.map((mapping) => (
            <div key={mapping.id} className="grid gap-4 py-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="flex flex-wrap items-end gap-3">
                <form
                  action={mutateStoreCategoryCatalogueAction}
                  className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]"
                >
                  <input type="hidden" name="intent" value="update-taxonomy-mapping" />
                  <input type="hidden" name="id" value={mapping.id} />
                  <label className="text-sm font-medium text-gray-700 sm:col-span-2">
                    Shopify taxonomy category ID
                    <input
                      className={inputClass}
                      name="shopifyTaxonomyCategoryId"
                      defaultValue={mapping.shopifyTaxonomyCategoryId}
                      maxLength={255}
                      required
                    />
                  </label>
                  <label className="text-sm font-medium text-gray-700">
                    Category
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
                    Weight
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
                  <label className="text-sm font-medium text-gray-700 sm:col-span-2">
                    Audit reason
                    <input className={inputClass} name="reason" maxLength={1000} required />
                  </label>
                  <button
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 sm:col-span-2"
                    type="submit"
                  >
                    Save mapping
                  </button>
                </form>
                <form action={mutateStoreCategoryCatalogueAction} className="flex gap-2">
                  <input type="hidden" name="intent" value="remove-taxonomy-mapping" />
                  <input type="hidden" name="id" value={mapping.id} />
                  <label className="sr-only" htmlFor={`remove-reason-${mapping.id}`}>
                    Removal audit reason
                  </label>
                  <input
                    id={`remove-reason-${mapping.id}`}
                    className={`${inputClass} min-w-40`}
                    name="reason"
                    maxLength={1000}
                    placeholder="Audit reason"
                    required
                  />
                  <button
                    className="rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-50"
                    type="submit"
                  >
                    Remove
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}