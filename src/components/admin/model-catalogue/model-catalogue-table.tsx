import Link from "next/link";
import { createOpenRouterModelId } from "@modainteract/moda-interact-shared/commerce/model";
import type {
  ModelCatalogueAdminPage,
  ModelCatalogueAdminRow,
} from "@/lib/admin/model-catalogue";
import { ModelCatalogueEditor } from "./model-catalogue-editor";

type ModelCatalogueFilters = {
  availabilityId?: string;
  query?: string;
  status?: string;
  page: number;
};

type ModelCatalogueTableProps = {
  catalogue: ModelCatalogueAdminPage;
  canMutate: boolean;
  drawer?: string;
  selectedId?: string;
  filters: ModelCatalogueFilters;
};

function tableDrawerHref(
  drawer: string,
  row: ModelCatalogueAdminRow | undefined,
  filters: ModelCatalogueFilters,
): string {
  const params = new URLSearchParams();
  params.set("drawer", drawer);
  if (row) params.set("id", row.model.id);
  if (filters.availabilityId)
    params.set("availabilityId", filters.availabilityId);
  if (filters.query) params.set("query", filters.query);
  if (filters.status) params.set("status", filters.status);
  if (filters.page > 1) params.set("page", String(filters.page));
  return `/commerce-models/catalogue?${params.toString()}`;
}

function pageHref(page: number, filters: ModelCatalogueFilters): string {
  const params = new URLSearchParams();
  if (filters.availabilityId)
    params.set("availabilityId", filters.availabilityId);
  if (filters.query) params.set("query", filters.query);
  if (filters.status && filters.status !== "all")
    params.set("status", filters.status);
  params.set("page", String(page));
  return `/commerce-models/catalogue?${params.toString()}`;
}

function configurationLabel(row: ModelCatalogueAdminRow): string {
  return Object.keys(row.model.configuration).length === 0
    ? "Default"
    : "Configured";
}

function rowActionHref(
  row: ModelCatalogueAdminRow,
  canMutate: boolean,
  filters: ModelCatalogueFilters,
): string {
  return tableDrawerHref(canMutate ? "edit" : "view", row, filters);
}

export function ModelCatalogueTable({
  catalogue,
  canMutate,
  drawer,
  selectedId,
  filters,
}: ModelCatalogueTableProps) {
  const selectedRow = catalogue.rows.find((row) => row.model.id === selectedId);
  const pageCount = Math.ceil(catalogue.total / catalogue.pageSize);
  const closeHref = "/commerce-models/catalogue";

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand-900)]">
            Model catalogue
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Create and configure the models that Moda can make available to
            Platform and individual Shops. Commerce Studio selects from this
            Admin-managed catalogue; it does not create models.
          </p>
        </div>
        {canMutate ? (
          <Link
            href={tableDrawerHref("create", undefined, filters)}
            className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]"
          >
            Create model
          </Link>
        ) : null}
      </div>

      <form
        method="get"
        action="/commerce-models/catalogue"
        className="mb-5 grid gap-3 border-y border-gray-200 bg-white py-4 sm:grid-cols-2 xl:grid-cols-[minmax(16rem,2fr)_minmax(14rem,1fr)_minmax(10rem,1fr)_auto]"
      >
        <label className="text-sm font-medium text-gray-800">
          Search
          <input
            className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)]"
            name="query"
            defaultValue={filters.query}
            placeholder="Search model name, provider or model ID"
          />
        </label>
        <label className="text-sm font-medium text-gray-800">
          Availability
          <select
            className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)]"
            name="availabilityId"
            defaultValue={filters.availabilityId ?? ""}
          >
            <option value="">All Availability</option>
            {catalogue.availabilities.map((option) => (
              <option
                key={option.availability.id}
                value={option.availability.id}
              >
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-gray-800">
          Status
          <select
            className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)]"
            name="status"
            defaultValue={
              filters.status === "enabled" || filters.status === "disabled"
                ? filters.status
                : "all"
            }
          >
            <option value="all">All</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
        <div className="flex items-end gap-3">
          <button
            type="submit"
            className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]"
          >
            Apply filters
          </button>
          <Link
            href="/commerce-models/catalogue"
            className="px-2 py-2 text-sm font-semibold text-[var(--brand-700)] hover:underline"
          >
            Reset
          </Link>
        </div>
      </form>

      {catalogue.rows.length === 0 ? (
        <p className="border-y border-gray-200 py-10 text-sm text-gray-600">
          No model catalogue entries match the current filters.
        </p>
      ) : (
        <div className="overflow-x-auto border-y border-gray-200 bg-white">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold text-gray-600">
              <tr>
                <th className="px-3 py-3">Model</th>
                <th className="px-3 py-3">OpenRouter model ID</th>
                <th className="px-3 py-3">Availability</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Configuration</th>
                <th className="px-3 py-3">Selections</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {catalogue.rows.map((row) => (
                <tr key={row.model.id}>
                  <td className="max-w-[20rem] px-3 py-3 align-top">
                    <div className="font-semibold text-gray-950">
                      {row.model.displayName}
                    </div>
                    {row.model.description ? (
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-600">
                        {row.model.description}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 align-top font-mono text-xs text-gray-800">
                    {createOpenRouterModelId({
                      provider: row.model.provider,
                      providerModelId: row.model.providerModelId,
                    })}
                  </td>
                  <td className="px-3 py-3 align-top text-gray-700">
                    {row.availabilityLabel}
                  </td>
                  <td className="px-3 py-3 align-top text-gray-700">
                    {row.model.enabled ? "Enabled" : "Disabled"}
                  </td>
                  <td className="px-3 py-3 align-top text-gray-700">
                    {configurationLabel(row)}
                  </td>
                  <td className="px-3 py-3 align-top tabular-nums text-gray-700">
                    {row.selectionCount}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <Link
                      href={rowActionHref(row, canMutate, filters)}
                      className="font-semibold text-[var(--brand-700)] hover:underline"
                    >
                      {canMutate ? "Edit" : "View"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 ? (
        <nav
          aria-label="Catalogue pages"
          className="mt-4 flex items-center justify-between text-sm"
        >
          <span className="text-gray-600">
            Page {catalogue.page} of {pageCount} · {catalogue.total} entries
          </span>
          <div className="flex gap-3">
            {catalogue.page > 1 ? (
              <Link
                href={pageHref(catalogue.page - 1, filters)}
                className="font-semibold text-[var(--brand-700)] hover:underline"
              >
                Previous
              </Link>
            ) : (
              <span className="text-gray-400">Previous</span>
            )}
            {catalogue.page < pageCount ? (
              <Link
                href={pageHref(catalogue.page + 1, filters)}
                className="font-semibold text-[var(--brand-700)] hover:underline"
              >
                Next
              </Link>
            ) : (
              <span className="text-gray-400">Next</span>
            )}
          </div>
        </nav>
      ) : null}

      {drawer === "create" && canMutate ? (
        <ModelCatalogueEditor
          mode="create"
          availabilityOptions={catalogue.availabilities}
          closeHref={closeHref}
          canMutate={canMutate}
        />
      ) : null}
      {drawer === "edit" && canMutate && selectedRow ? (
        <ModelCatalogueEditor
          mode="edit"
          row={selectedRow}
          availabilityOptions={catalogue.availabilities}
          closeHref={closeHref}
          canMutate={canMutate}
        />
      ) : null}
      {drawer === "view" && !canMutate && selectedRow ? (
        <ModelCatalogueEditor
          mode="view"
          row={selectedRow}
          availabilityOptions={catalogue.availabilities}
          closeHref={closeHref}
          canMutate={canMutate}
        />
      ) : null}
    </>
  );
}
