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
import {
  StoreCategoryMappingWorkspace,
  type StoreCategoryMappingWorkspaceItem,
} from "./store-category-mapping-workspace";
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

  const mappings: StoreCategoryMappingWorkspaceItem[] = session.shopifyMappings.map(
    (mapping) => ({
      id: mapping.clientId,
      taxonomy: mapping.taxonomy,
      weight: mapping.weight,
    }),
  );

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

      <div className="mt-5">
        <StoreCategoryMappingWorkspace
          pickerId="author-shopify-taxonomy-add"
          rootTaxonomy={session.category.referenceTaxonomy}
          mappings={mappings}
          onAdd={addMapping}
          renderMappingControls={(mapping) => (
            <div className="grid gap-3 sm:grid-cols-[8rem_auto] sm:items-end sm:justify-end">
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
                      clientId: mapping.id,
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
                    clientId: mapping.id,
                    now: storeCategoryAuthoringNow(),
                  })
                }
              >
                Remove
              </button>
            </div>
          )}
        />
      </div>

      <StoreCategoryAuthoringErrorList issues={validation.issues} />
    </section>
  );
}
