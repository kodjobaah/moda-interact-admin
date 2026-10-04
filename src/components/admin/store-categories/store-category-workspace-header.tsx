import type { StoreCategoryCatalogue } from "@/lib/admin/store-categories";

type Category = StoreCategoryCatalogue["categories"][number];

export function StoreCategoryWorkspaceHeader({ category }: { category: Category }) {
  return (
    <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold text-gray-950">
            {category.displayName}
          </h2>
          <span
            className={`rounded-full px-2 py-1 text-xs font-semibold ${
              category.enabled
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            {category.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>
        <p className="mt-1 font-mono text-xs text-gray-500">
          {category.slug} · immutable identity
        </p>
        <p className="mt-2 max-w-3xl text-sm text-gray-600">
          {category.description?.trim() || "No category description has been added."}
        </p>
      </div>

      <dl className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-2 rounded-lg bg-gray-50 px-4 py-3 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Default template</dt>
          <dd className="mt-1 max-w-48 truncate font-medium text-gray-900">
            {category.defaultTemplate?.displayName ?? "Not selected"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Display order</dt>
          <dd className="mt-1 font-medium text-gray-900">{category.displayOrder}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Active profiles</dt>
          <dd className="mt-1 font-medium text-gray-900">{category.activeShopProfileCount}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Pending profiles</dt>
          <dd className="mt-1 font-medium text-gray-900">{category.pendingShopProfileCount}</dd>
        </div>
      </dl>
    </div>
  );
}
