import { mutateStoreCategoryCatalogueAction } from "@/app/actions/store-categories";
import type { StoreCategoryCatalogue } from "@/lib/admin/store-categories";
import { PromptTemplateEditor } from "./prompt-template-editor";
import { TaxonomyMappingEditor } from "./taxonomy-mapping-editor";

type Category = StoreCategoryCatalogue["categories"][number];

const inputClass =
  "mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)]";

export function StoreCategoryEditor({
  category,
  categories,
}: {
  category: Category;
  categories: Category[];
}) {
  const templates = category.templates;

  return (
    <div className="min-w-0 space-y-8">
      <section className="border-b border-gray-200 pb-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-950">
              {category.displayName}
            </h2>
            <p className="mt-1 font-mono text-xs text-gray-500">
              {category.slug} · immutable identity
            </p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-gray-600">
            <span>Active profiles: {category.activeShopProfileCount}</span>
            <span>Pending profiles: {category.pendingShopProfileCount}</span>
          </div>
        </div>
        <form
          action={mutateStoreCategoryCatalogueAction}
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <input type="hidden" name="intent" value="update-category" />
          <input type="hidden" name="id" value={category.id} />
          <input
            type="hidden"
            name="expectedEditVersion"
            value={category.editVersion}
          />
          <label className="text-sm font-medium text-gray-700">
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
          <label className="text-sm font-medium text-gray-700">
            Status
            <select
              className={inputClass}
              name="enabled"
              defaultValue={String(category.enabled)}
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </label>
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
        <p className="mt-3 text-sm text-gray-600">
          Shopify localization keys must exist before merchants can select this category.
        </p>
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-gray-900">Default template</h3>
          <p className="mt-1 text-sm text-gray-600">
            {category.defaultTemplate?.displayName ?? "No default template selected"}
          </p>
          <form
            action={mutateStoreCategoryCatalogueAction}
            className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]"
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
                  {template.displayName}{!template.enabled || !template.promptText.trim() ? " (not selectable)" : ""}
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
        </div>
      </section>

      <section>
        <h3 className="mb-4 text-lg font-semibold text-gray-950">Prompt templates</h3>
        <div className="space-y-6">
          <PromptTemplateEditor categoryId={category.id} />
          {templates.map((template) => (
            <PromptTemplateEditor key={template.id} template={template} categoryId={category.id} />
          ))}
        </div>
      </section>

      <TaxonomyMappingEditor category={category} categories={categories} />
    </div>
  );
}