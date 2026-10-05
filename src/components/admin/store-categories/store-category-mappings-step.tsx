"use client";

import type { Dispatch } from "react";
import {
  validateStoreCategoryAuthoringSession,
  type StoreCategoryAuthoringAction,
  type StoreCategoryAuthoringSession,
} from "./store-category-authoring-session";
import {
  createStoreCategoryAuthoringClientId,
  storeCategoryAuthoringNow,
} from "./store-category-authoring-runtime";
import type { StoreCategoryTaxonomyReference } from "@/lib/admin/store-category-taxonomy-reference";
import { ShopifyTaxonomyPicker } from "./shopify-taxonomy-picker";
import {
  STORE_CATEGORY_AUTHORING_INPUT_CLASS,
  StoreCategoryAuthoringErrorList,
  StoreCategoryAuthoringSectionStatus,
} from "./store-category-authoring-ui";

function displayTaxonomyPath(fullName: string): string {
  return fullName.replaceAll(" > ", " › ");
}

export function StoreCategoryMappingsStep({
  session,
  dispatch,
}: {
  session: StoreCategoryAuthoringSession;
  dispatch: Dispatch<StoreCategoryAuthoringAction>;
}) {
  const validation =
    validateStoreCategoryAuthoringSession(session).shopifyMappings;
  const unavailableSelections = session.shopifyMappings.flatMap((mapping) =>
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

  function addMapping(taxonomy: StoreCategoryTaxonomyReference | null) {
    if (!taxonomy) return;
    if (
      session.shopifyMappings.some(
        (mapping) => mapping.taxonomy?.categoryId === taxonomy.categoryId,
      )
    ) {
      return;
    }

    const incompleteMapping = session.shopifyMappings.find(
      (mapping) => mapping.taxonomy === null,
    );
    if (incompleteMapping) {
      dispatch({
        type: "mapping.changed",
        clientId: incompleteMapping.clientId,
        patch: { taxonomy },
        now: storeCategoryAuthoringNow(),
      });
      return;
    }

    dispatch({
      type: "mapping.added",
      mapping: {
        clientId: createStoreCategoryAuthoringClientId(),
        taxonomy,
        weight: 1,
      },
      now: storeCategoryAuthoringNow(),
    });
  }

  return (
    <section aria-labelledby="author-mappings-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            id="author-mappings-title"
            className="text-lg font-semibold text-gray-950"
          >
            Category mappings
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            Optional. Add reference-taxonomy subcategories that should suggest this
            Store Category. You can continue without any mappings.
          </p>
        </div>
        <StoreCategoryAuthoringSectionStatus valid={validation.valid} />
      </div>

      <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">Add a mapping</h4>
            <p className="mt-1 text-sm text-gray-600">
              Search once below and choose a subcategory. Selecting it adds the
              mapping to the list underneath.
            </p>
          </div>
          {session.category.referenceTaxonomy ? (
            <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-gray-200">
              Within {session.category.referenceTaxonomy.name}
            </span>
          ) : null}
        </div>

        <div className="mt-4">
          <ShopifyTaxonomyPicker
            id="author-shopify-taxonomy-add"
            value=""
            scope="subcategories"
            rootId={session.category.referenceTaxonomy?.categoryId ?? null}
            allowRawId={false}
            unavailableSelections={unavailableSelections}
            showSelectionSummary={false}
            selectionActionLabel="Add"
            selectionPendingLabel="Adding…"
            onSelectionChange={addMapping}
          />
        </div>
      </div>

      <div className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">
              Added mappings ({session.shopifyMappings.length})
            </h4>
            <p className="mt-1 text-sm text-gray-600">
              Leave weight at 1 for normal mappings. Increase it only when this
              mapping should contribute more strongly when category scores are
              compared.
            </p>
          </div>
        </div>

        {session.shopifyMappings.length === 0 ? (
          <div className="mt-3 rounded-md border border-dashed border-gray-300 bg-white p-5 text-sm text-gray-600">
            No mappings added yet. Select a taxonomy category above, or continue to
            Review without mappings.
          </div>
        ) : (
          <div className="mt-3 divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white">
            {session.shopifyMappings.map((mapping) => (
              <div
                key={mapping.clientId}
                className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-end"
              >
                <div className="min-w-0">
                  {mapping.taxonomy ? (
                    <>
                      <p className="text-sm font-semibold text-gray-900">
                        {displayTaxonomyPath(mapping.taxonomy.fullName)}
                      </p>
                      <p className="mt-1 break-all font-mono text-xs text-gray-500">
                        {mapping.taxonomy.categoryId}
                      </p>
                    </>
                  ) : (
                    <p className="rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                      This earlier browser draft contains an incomplete mapping.
                      Select a category above to complete it, or remove it.
                    </p>
                  )}
                </div>

                <label className="text-sm font-medium text-gray-700">
                  Weight
                  <input
                    className={STORE_CATEGORY_AUTHORING_INPUT_CLASS}
                    type="number"
                    min={1}
                    max={1_000_000}
                    step={1}
                    value={mapping.weight}
                    onChange={(event) =>
                      dispatch({
                        type: "mapping.changed",
                        clientId: mapping.clientId,
                        patch: { weight: Number(event.target.value) },
                        now: storeCategoryAuthoringNow(),
                      })
                    }
                  />
                </label>

                <button
                  type="button"
                  className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                  onClick={() =>
                    dispatch({
                      type: "mapping.removed",
                      clientId: mapping.clientId,
                      now: storeCategoryAuthoringNow(),
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {session.shopifyMappings.length > 0 ? (
          <p className="mt-3 text-xs text-gray-500">
            To change a taxonomy category, remove its mapping and add the replacement
            above.
          </p>
        ) : null}
      </div>

      <StoreCategoryAuthoringErrorList issues={validation.issues} />
    </section>
  );
}
