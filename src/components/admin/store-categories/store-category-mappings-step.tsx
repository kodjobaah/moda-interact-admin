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
import { ShopifyTaxonomyPicker } from "./shopify-taxonomy-picker";
import {
  STORE_CATEGORY_AUTHORING_INPUT_CLASS,
  StoreCategoryAuthoringErrorList,
  StoreCategoryAuthoringSectionStatus,
} from "./store-category-authoring-ui";

export function StoreCategoryMappingsStep({
  session,
  dispatch,
}: {
  session: StoreCategoryAuthoringSession;
  dispatch: Dispatch<StoreCategoryAuthoringAction>;
}) {
  const validation =
    validateStoreCategoryAuthoringSession(session).shopifyMappings;

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
            Optional. Search the reference taxonomy for subcategories that should suggest this Store Category. Shopify consumes the exact taxonomy ID; WooCommerce can use the persisted name/full path. Mapping weights are summed; the highest score wins.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StoreCategoryAuthoringSectionStatus valid={validation.valid} />
          <button
            type="button"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
            onClick={() =>
              dispatch({
                type: "mapping.added",
                mapping: {
                  clientId: createStoreCategoryAuthoringClientId(),
                  taxonomy: null,
                  weight: 1,
                },
                now: storeCategoryAuthoringNow(),
              })
            }
          >
            + Add mapping
          </button>
        </div>
      </div>

      {session.shopifyMappings.length === 0 ? (
        <div className="mt-5 rounded-md border border-dashed border-gray-300 p-6 text-sm text-gray-600">
          No category mappings. You can continue without mappings and add them later.
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {session.shopifyMappings.map((mapping, index) => (
            <div
              key={mapping.clientId}
              className="grid gap-3 rounded-md border border-gray-200 bg-gray-50 p-4 sm:grid-cols-[minmax(0,1fr)_10rem_auto]"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-700">
                  Reference taxonomy category {index + 1}
                </p>
                <div className="mt-1">
                  <ShopifyTaxonomyPicker
                    id={`author-shopify-taxonomy-${mapping.clientId}`}
                    value={mapping.taxonomy?.categoryId ?? ""}
                    scope="subcategories"
                    rootId={session.category.referenceTaxonomy?.categoryId ?? null}
                    allowRawId={false}
                    fallbackSelection={mapping.taxonomy}
                    onSelectionChange={(taxonomy) =>
                      dispatch({
                        type: "mapping.changed",
                        clientId: mapping.clientId,
                        patch: { taxonomy },
                        now: storeCategoryAuthoringNow(),
                      })
                    }
                  />
                </div>
              </div>

              <label className="text-sm font-medium text-gray-700">
                Suggestion weight
                <input
                  className={STORE_CATEGORY_AUTHORING_INPUT_CLASS}
                  type="number"
                  min={1}
                  max={1_000_000}
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

              <div className="flex items-end">
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
            </div>
          ))}
        </div>
      )}

      <StoreCategoryAuthoringErrorList issues={validation.issues} />
    </section>
  );
}
