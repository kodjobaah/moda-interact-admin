"use client";

import type { ReactNode } from "react";
import type { StoreCategoryTaxonomyReference } from "@/lib/admin/store-category-taxonomy-reference";
import { ShopifyTaxonomyPicker } from "./shopify-taxonomy-picker";

export type StoreCategoryMappingWorkspaceItem = {
  id: string;
  taxonomy: StoreCategoryTaxonomyReference | null;
  conditionKey?: string | null;
  displayName?: string | null;
  weight: number;
  statusLabel?: string;
};

type UnavailableTaxonomySelection = {
  categoryId: string;
  reason: string;
  actionLabel?: string;
};

function displayTaxonomyPath(fullName: string): string {
  return fullName.replaceAll(" > ", " › ");
}

export function StoreCategoryMappingWorkspace({
  pickerId,
  rootTaxonomy,
  mappings,
  addContext,
  unavailableSelections = [],
  selectionDisabled = false,
  onAdd,
  renderMappingControls,
  emptyMessage =
    "No mappings added yet. Select a taxonomy category above, or continue without mappings.",
}: {
  pickerId: string;
  rootTaxonomy: StoreCategoryTaxonomyReference | null;
  mappings: StoreCategoryMappingWorkspaceItem[];
  addContext?: ReactNode;
  unavailableSelections?: UnavailableTaxonomySelection[];
  selectionDisabled?: boolean;
  onAdd: (taxonomy: StoreCategoryTaxonomyReference | null) => void;
  renderMappingControls: (mapping: StoreCategoryMappingWorkspaceItem) => ReactNode;
  emptyMessage?: string;
}) {
  const mappingSelections = mappings.flatMap((mapping) =>
    mapping.taxonomy
      ? [
          {
            categoryId: mapping.taxonomy.categoryId,
            reason: "Already added to this Store Category.",
            actionLabel: "Added",
          },
        ]
      : [],
  );
  const unavailableById = new Map<string, UnavailableTaxonomySelection>();
  for (const selection of mappingSelections) {
    unavailableById.set(selection.categoryId, selection);
  }
  for (const selection of unavailableSelections) {
    unavailableById.set(selection.categoryId, selection);
  }

  function addMapping(taxonomy: StoreCategoryTaxonomyReference | null) {
    if (!taxonomy || unavailableById.has(taxonomy.categoryId)) return;
    onAdd(taxonomy);
  }

  return (
    <div>
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">Add a mapping</h4>
            <p className="mt-1 text-sm text-gray-600">
              Search once below and choose a subcategory. The mapping is then managed
              from the compact list underneath.
            </p>
          </div>
          {rootTaxonomy ? (
            <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-gray-200">
              Within {rootTaxonomy.name}
            </span>
          ) : null}
        </div>

        {addContext ? <div className="mt-4">{addContext}</div> : null}

        <div className="mt-4">
          {rootTaxonomy ? (
            <ShopifyTaxonomyPicker
              id={pickerId}
              value=""
              scope="subcategories"
              rootId={rootTaxonomy.categoryId}
              allowRawId={false}
              unavailableSelections={[...unavailableById.values()]}
              showSelectionSummary={false}
              selectionActionLabel="Add"
              selectionPendingLabel="Adding…"
              selectionDisabled={selectionDisabled}
              onSelectionChange={addMapping}
            />
          ) : (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              This Store Category does not have a reference taxonomy root. Choose or
              repair the reference category before adding mappings.
            </p>
          )}
        </div>
      </div>

      <div className="mt-6">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">
            Added mappings ({mappings.length})
          </h4>
          <p className="mt-1 text-sm text-gray-600">
            Leave weight at 1 for normal mappings. Increase it only when this mapping
            should contribute more strongly when category scores are compared.
          </p>
        </div>

        {mappings.length === 0 ? (
          <div className="mt-3 rounded-md border border-dashed border-gray-300 bg-white p-5 text-sm text-gray-600">
            {emptyMessage}
          </div>
        ) : (
          <div className="mt-3 divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white">
            {mappings.map((mapping) => (
              <div
                key={mapping.id}
                className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,auto)] lg:items-end"
              >
                <div className="min-w-0">
                  {mapping.taxonomy ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">
                          {displayTaxonomyPath(mapping.taxonomy.fullName)}
                        </p>
                        {mapping.statusLabel ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            {mapping.statusLabel}
                          </span>
                        ) : null}
                      </div>
                      {mapping.displayName ? (
                        <p className="mt-1 text-sm text-gray-700">
                          Merchant label: <span className="font-medium">{mapping.displayName}</span>
                        </p>
                      ) : null}
                      {mapping.conditionKey ? (
                        <p className="mt-1 font-mono text-xs text-gray-500">
                          mappings.{mapping.conditionKey}
                        </p>
                      ) : null}
                      <p className="mt-1 break-all font-mono text-xs text-gray-500">
                        {mapping.taxonomy.categoryId}
                      </p>
                    </>
                  ) : (
                    <p className="rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                      This earlier browser draft contains an incomplete mapping. Select
                      a category above to complete it, or remove it.
                    </p>
                  )}
                </div>

                <div className="min-w-0">{renderMappingControls(mapping)}</div>
              </div>
            ))}
          </div>
        )}

        {mappings.length > 0 ? (
          <p className="mt-3 text-xs text-gray-500">
            To change a taxonomy category, remove its mapping and add the replacement
            above.
          </p>
        ) : null}
      </div>
    </div>
  );
}
