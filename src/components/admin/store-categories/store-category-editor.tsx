import { mutateStoreCategoryCatalogueAction } from "@/app/actions/store-categories";
import type { StoreCategoryCatalogue } from "@/lib/admin/store-categories";
import type { TranslationConfigurationAdminData } from "@/lib/admin/translation-configuration";
import { PromptTemplateWorkspace } from "./prompt-template-workspace";
import type { StoreCategoryTab } from "./store-category-catalog";
import { StoreCategoryMaintenanceTabs } from "./store-category-maintenance-tabs";
import { StoreCategoryTranslationEnablement } from "./store-category-translation-enablement";
import { StoreCategoryWorkspaceHeader } from "./store-category-workspace-header";
import { TaxonomyMappingEditor } from "./taxonomy-mapping-editor";

type Category = StoreCategoryCatalogue["categories"][number];

const inputClass =
  "mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)] disabled:bg-gray-100 disabled:text-gray-500";

export function StoreCategoryEditor({
  category,
  activeTab,
  selectedTemplateId,
  translationConfiguration,
  canManageTranslations,
}: {
  category: Category;
  activeTab: StoreCategoryTab;
  selectedTemplateId?: string;
  translationConfiguration: TranslationConfigurationAdminData;
  canManageTranslations: boolean;
}) {
  const templates = category.templates;

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <StoreCategoryWorkspaceHeader category={category} />
      <StoreCategoryMaintenanceTabs
        categoryId={category.id}
        activeTab={activeTab}
        templateCount={templates.length}
        mappingCount={category.taxonomyMappings.length}
      />

      <div className="p-5">
        {activeTab === "details" ? (
          <section aria-labelledby="store-category-details-title">
            <div className="mb-5">
              <h3 id="store-category-details-title" className="text-lg font-semibold text-gray-950">
                Category details
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                Store Categories are edited while disabled. A disabled draft can only
                become enabled through the translation/enablement workflow below.
              </p>
            </div>

            {category.enabled ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <h4 className="text-sm font-semibold text-amber-900">
                  Disable before editing
                </h4>
                <p className="mt-1 text-sm text-amber-800">
                  Category labels, mappings and prompt templates form the reviewed
                  configuration used for localization and prompt generation. Disable this
                  category before changing them.
                </p>
                <form
                  action={mutateStoreCategoryCatalogueAction}
                  className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
                >
                  <input type="hidden" name="intent" value="update-category" />
                  <input type="hidden" name="id" value={category.id} />
                  <input type="hidden" name="displayName" value={category.displayName} />
                  <input type="hidden" name="description" value={category.description} />
                  <input type="hidden" name="displayOrder" value={category.displayOrder} />
                  <input type="hidden" name="enabled" value="false" />
                  <input
                    type="hidden"
                    name="expectedEditVersion"
                    value={category.editVersion}
                  />
                  <label className="text-sm font-medium text-amber-900">
                    Audit reason
                    <input
                      className={inputClass}
                      name="reason"
                      maxLength={1000}
                      placeholder="Why is this live Store Category being disabled?"
                      required
                    />
                  </label>
                  <button
                    className="rounded-md border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
                    type="submit"
                  >
                    Disable Category
                  </button>
                </form>
              </div>
            ) : (
              <form
                action={mutateStoreCategoryCatalogueAction}
                className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
              >
                <input type="hidden" name="intent" value="update-category" />
                <input type="hidden" name="id" value={category.id} />
                <input type="hidden" name="enabled" value="false" />
                <input
                  type="hidden"
                  name="expectedEditVersion"
                  value={category.editVersion}
                />
                <label className="text-sm font-medium text-gray-700 xl:col-span-2">
                  Display name
                  <input
                    className={inputClass}
                    name="displayName"
                    defaultValue={category.displayName}
                    maxLength={255}
                    required
                  />
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Display order
                  <input
                    className={inputClass}
                    name="displayOrder"
                    type="number"
                    min={0}
                    max={1_000_000}
                    defaultValue={category.displayOrder}
                    required
                  />
                </label>
                <div className="rounded-md bg-gray-50 p-3 text-sm text-gray-700">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Status
                  </span>
                  <span className="mt-1 block font-medium">Disabled draft</span>
                </div>
                <label className="text-sm font-medium text-gray-700 sm:col-span-2 xl:col-span-4">
                  Description
                  <textarea
                    className={inputClass}
                    name="description"
                    defaultValue={category.description}
                    maxLength={2000}
                    rows={3}
                  />
                </label>
                <label className="text-sm font-medium text-gray-700 sm:col-span-2 xl:col-span-3">
                  Audit reason
                  <input className={inputClass} name="reason" maxLength={1000} required />
                </label>
                <div className="flex items-end">
                  <button
                    className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                    type="submit"
                  >
                    Save category
                  </button>
                </div>
              </form>
            )}

            <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="mb-3">
                <h4 className="text-sm font-semibold text-gray-900">Default template</h4>
                <p className="mt-1 text-sm text-gray-600">
                  {category.defaultTemplate?.displayName ?? "No default template selected"}
                </p>
              </div>
              {category.enabled ? (
                <p className="text-sm text-gray-600">
                  Disable this Store Category before changing the default template.
                </p>
              ) : (
                <form
                  action={mutateStoreCategoryCatalogueAction}
                  className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]"
                >
                  <input type="hidden" name="intent" value="select-default-template" />
                  <input type="hidden" name="categoryId" value={category.id} />
                  <input
                    type="hidden"
                    name="expectedCategoryEditVersion"
                    value={category.editVersion}
                  />
                  <select
                    className={inputClass}
                    name="templateId"
                    required
                    defaultValue={category.defaultTemplateId ?? ""}
                  >
                    <option value="" disabled>Select an enabled template</option>
                    {templates.map((template) => (
                      <option
                        key={template.id}
                        value={template.id}
                        disabled={!template.enabled || !template.promptText.trim()}
                      >
                        {template.displayName}
                        {!template.enabled || !template.promptText.trim() ? " (not selectable)" : ""}
                      </option>
                    ))}
                  </select>
                  <input
                    className={inputClass}
                    name="reason"
                    maxLength={1000}
                    placeholder="Audit reason"
                    required
                  />
                  <button
                    className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]"
                    type="submit"
                  >
                    Set default
                  </button>
                </form>
              )}
            </div>

            <StoreCategoryTranslationEnablement
              category={category}
              translationConfiguration={translationConfiguration}
              canManage={canManageTranslations}
            />
          </section>
        ) : null}

        {activeTab === "templates" ? (
          <PromptTemplateWorkspace
            category={category}
            selectedTemplateId={selectedTemplateId}
          />
        ) : null}

        {activeTab === "taxonomy" ? (
          <TaxonomyMappingEditor category={category} />
        ) : null}
      </div>
    </section>
  );
}
