import Link from "next/link";
import { mutateStoreCategoryCatalogueAction } from "@/app/actions/store-categories";
import type { StoreCategoryCatalogue } from "@/lib/admin/store-categories";
import { StoreCategoryEditor } from "./store-category-editor";

const inputClass =
  "mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)]";

export function StoreCategoryCatalog({
  catalogue,
  selectedCategoryId,
}: {
  catalogue: StoreCategoryCatalogue;
  selectedCategoryId?: string;
}) {
  const selectedCategory =
    catalogue.categories.find((category) => category.id === selectedCategoryId) ??
    catalogue.categories[0];

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--brand-900)]">
          Store Categories
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-600">
          Manage category identities, their current default prompts, and Shopify taxonomy mappings.
        </p>
      </div>

      <form
        action={mutateStoreCategoryCatalogueAction}
        className="mb-8 grid gap-4 border-y border-gray-200 py-5 sm:grid-cols-2 xl:grid-cols-6"
      >
        <input type="hidden" name="intent" value="create-category" />
        <input type="hidden" name="enabled" value="false" />
        <label className="text-sm font-medium text-gray-700">
          Stable slug
          <input
            className={inputClass}
            name="slug"
            pattern="[a-z][a-z0-9-]{0,127}"
            maxLength={128}
            required
          />
        </label>
        <label className="text-sm font-medium text-gray-700">
          Display name
          <input className={inputClass} name="displayName" maxLength={255} required />
        </label>
        <label className="text-sm font-medium text-gray-700">
          Display order
          <input
            className={inputClass}
            name="displayOrder"
            type="number"
            min={0}
            max={1_000_000}
            defaultValue={0}
            required
          />
        </label>
        <label className="text-sm font-medium text-gray-700">
          Initial status
          <span className={`${inputClass} block text-gray-600`}>
            Disabled until a valid default template is selected
          </span>
        </label>
        <label className="text-sm font-medium text-gray-700 sm:col-span-2">
          Description
          <textarea className={inputClass} name="description" maxLength={2000} rows={2} />
        </label>
        <label className="text-sm font-medium text-gray-700 sm:col-span-2 xl:col-span-4">
          Audit reason
          <input className={inputClass} name="reason" maxLength={1000} required />
        </label>
        <div className="flex items-end">
          <button
            className="w-full rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]"
            type="submit"
          >
            Create category
          </button>
        </div>
      </form>

      {catalogue.categories.length === 0 ? (
        <p className="border-y border-gray-200 py-8 text-sm text-gray-600">
          No Store Categories have been created.
        </p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <nav aria-label="Store Categories" className="space-y-1">
            {catalogue.categories.map((category) => (
              <Link
                key={category.id}
                href={`/system-controls/store-categories?category=${encodeURIComponent(category.id)}`}
                aria-current={category.id === selectedCategory?.id ? "page" : undefined}
                className={`block rounded-md px-3 py-2 text-sm ${category.id === selectedCategory?.id ? "bg-[var(--brand-100)] font-semibold text-[var(--brand-900)]" : "text-gray-700 hover:bg-gray-100"}`}
              >
                <span className="block truncate">{category.displayName}</span>
                <span className="mt-1 block text-xs font-normal text-gray-500">
                  {category.enabled ? "Enabled" : "Disabled"} · {category.templates.length} templates
                </span>
              </Link>
            ))}
          </nav>
          {selectedCategory ? (
            <StoreCategoryEditor
              category={selectedCategory}
              categories={catalogue.categories}
            />
          ) : null}
        </div>
      )}
    </>
  );
}