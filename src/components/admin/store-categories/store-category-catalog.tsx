import Link from "next/link";
import type { StoreCategoryCatalogue } from "@/lib/admin/store-categories";
import type { TranslationConfigurationAdminData } from "@/lib/admin/translation-configuration";
import type { ReferenceTaxonomyIndexStatus } from "@/lib/admin/shopify-taxonomy-index-management";
import { StoreCategoryCreationWorkspace } from "./store-category-creation-workspace";
import { StoreCategoryEditor } from "./store-category-editor";
import { ReferenceTaxonomyIndexPanel } from "./reference-taxonomy-index-panel";

export type StoreCategoryTab = "details" | "templates" | "taxonomy";

export function StoreCategoryCatalog({
  catalogue,
  selectedCategoryId,
  selectedTab = "details",
  selectedTemplateId,
  taxonomyIndexStatus,
  translationConfiguration,
  canManageTaxonomy,
  canManageTranslations,
}: {
  catalogue: StoreCategoryCatalogue;
  selectedCategoryId?: string;
  selectedTab?: StoreCategoryTab;
  selectedTemplateId?: string;
  taxonomyIndexStatus: ReferenceTaxonomyIndexStatus;
  translationConfiguration: TranslationConfigurationAdminData;
  canManageTaxonomy: boolean;
  canManageTranslations: boolean;
}) {
  const selectedCategory =
    catalogue.categories.find((category) => category.id === selectedCategoryId) ??
    catalogue.categories[0];

  const assignedReferenceTaxonomy = catalogue.categories.flatMap((category) => {
    const categoryId = category.referenceTaxonomyCategoryId?.trim();
    return categoryId
      ? [
          {
            categoryId,
            storeCategoryDisplayName: category.displayName,
          },
        ]
      : [];
  });

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--brand-900)]">
          Store Categories
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-600">
          Manage category identities, their current default prompts, and cross-platform category mappings.
        </p>
      </div>

      <ReferenceTaxonomyIndexPanel
        status={taxonomyIndexStatus}
        canManage={canManageTaxonomy}
      />

      <StoreCategoryCreationWorkspace
        taxonomyReady={taxonomyIndexStatus.state === "READY"}
        assignedReferenceTaxonomy={assignedReferenceTaxonomy}
      />

      {catalogue.categories.length === 0 ? (
        <p className="border-y border-gray-200 py-8 text-sm text-gray-600">
          No Store Categories have been created.
        </p>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="self-start rounded-xl border border-gray-200 bg-white p-3 shadow-sm xl:sticky xl:top-4">
            <div className="px-2 pb-3">
              <h2 className="text-sm font-semibold text-gray-900">Existing categories</h2>
              <p className="mt-1 text-xs text-gray-500">{catalogue.categories.length} configured</p>
            </div>
            <nav aria-label="Store Categories" className="space-y-1">
              {catalogue.categories.map((category) => (
                <Link
                  key={category.id}
                  href={`/system-controls/store-categories?category=${encodeURIComponent(category.id)}&tab=${selectedTab}`}
                  aria-current={category.id === selectedCategory?.id ? "page" : undefined}
                  className={`block rounded-lg border px-3 py-3 text-sm transition-colors ${
                    category.id === selectedCategory?.id
                      ? "border-[var(--brand-300)] bg-[var(--brand-50)] font-semibold text-[var(--brand-900)] shadow-sm"
                      : "border-transparent text-gray-700 hover:border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <span className="block truncate">{category.displayName}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1 text-xs font-normal text-gray-500">
                    <span>{category.enabled ? "Enabled" : "Disabled"}</span>
                    <span>·</span>
                    <span>{category.templates.length} templates</span>
                    {category.defaultTemplateId ? (
                      <>
                        <span>·</span>
                        <span>default set</span>
                      </>
                    ) : null}
                  </span>
                </Link>
              ))}
            </nav>
          </aside>
          {selectedCategory ? (
            <StoreCategoryEditor
              category={selectedCategory}
              activeTab={selectedTab}
              selectedTemplateId={selectedTemplateId}
              translationConfiguration={translationConfiguration}
              canManageTranslations={canManageTranslations}
            />
          ) : null}
        </div>
      )}
    </>
  );
}
