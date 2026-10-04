import Link from "next/link";
import type { StoreCategoryCatalogue } from "@/lib/admin/store-categories";

type Category = StoreCategoryCatalogue["categories"][number];

export function PromptTemplateList({
  category,
  selectedTemplateId,
}: {
  category: Category;
  selectedTemplateId?: string;
}) {
  return (
    <aside className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center justify-between gap-2 px-1 pb-3">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">Templates</h4>
          <p className="mt-1 text-xs text-gray-500">{category.templates.length} configured</p>
        </div>
        <Link
          href={`/system-controls/store-categories?category=${encodeURIComponent(category.id)}&tab=templates&template=new`}
          className="rounded-md bg-[var(--brand-700)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--brand-800)]"
        >
          + New
        </Link>
      </div>

      <nav aria-label="Prompt templates" className="space-y-1">
        {category.templates.length === 0 ? (
          <p className="rounded-md bg-white px-3 py-4 text-sm text-gray-600">
            No prompt templates yet.
          </p>
        ) : (
          category.templates.map((template) => {
            const selected = template.id === selectedTemplateId;
            return (
              <Link
                key={template.id}
                href={`/system-controls/store-categories?category=${encodeURIComponent(category.id)}&tab=templates&template=${encodeURIComponent(template.id)}`}
                aria-current={selected ? "page" : undefined}
                className={`block rounded-md border px-3 py-3 text-sm transition-colors ${
                  selected
                    ? "border-[var(--brand-300)] bg-white font-semibold text-[var(--brand-900)] shadow-sm"
                    : "border-transparent text-gray-700 hover:border-gray-200 hover:bg-white"
                }`}
              >
                <span className="block truncate">{template.displayName}</span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-xs font-normal text-gray-500">
                  <span className="font-mono">{template.key}</span>
                  <span>·</span>
                  <span>{template.enabled ? "Enabled" : "Disabled"}</span>
                  {category.defaultTemplateId === template.id ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-800">
                      Default
                    </span>
                  ) : null}
                </span>
              </Link>
            );
          })
        )}
      </nav>
    </aside>
  );
}
