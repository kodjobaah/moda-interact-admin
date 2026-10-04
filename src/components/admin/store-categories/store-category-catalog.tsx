import Link from "next/link";
import type { StoreCategoryCatalogue } from "@/lib/admin/store-categories";
import { StoreCategoryCreationWorkspace } from "./store-category-creation-workspace";
import { StoreCategoryEditor } from "./store-category-editor";

export type StoreCategoryTab = "details" | "templates" | "taxonomy";

export function StoreCategoryCatalog({
  catalogue,
  selectedCategoryId,
  selectedTab = "details",
}: {
  catalogue: StoreCategoryCatalogue;
  selectedCategoryId?: string;
  selectedTab?: StoreCategoryTab;
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

      <StoreCategoryCreationWorkspace />

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
                href={`/system-controls/store-categories?category=${encodeURIComponent(category.id)}&tab=${selectedTab}`}
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
              activeTab={selectedTab}
            />
          ) : null}
        </div>
      )}
    </>
  );
}