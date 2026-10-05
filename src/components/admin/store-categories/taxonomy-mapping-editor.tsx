"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { mutateStoreCategoryCatalogueAction } from "@/app/actions/store-categories";
import type { StoreCategoryCatalogue } from "@/lib/admin/store-categories";
import {
  STORE_CATEGORY_REFERENCE_TAXONOMY_SOURCE,
  type StoreCategoryTaxonomyReference,
} from "@/lib/admin/store-category-taxonomy-reference";
import {
  StoreCategoryMappingWorkspace,
  type StoreCategoryMappingWorkspaceItem,
} from "./store-category-mapping-workspace";

type Category = StoreCategoryCatalogue["categories"][number];
const inputClass =
  "mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)]";

function referenceTaxonomyForCategory(
  category: Category,
): StoreCategoryTaxonomyReference | null {
  if (
    category.referenceTaxonomySource !== STORE_CATEGORY_REFERENCE_TAXONOMY_SOURCE ||
    !category.referenceTaxonomyVersion ||
    !category.referenceTaxonomyCategoryId ||
    !category.referenceTaxonomyCategoryName ||
    !category.referenceTaxonomyCategoryFullName
  ) {
    return null;
  }

  return {
    source: STORE_CATEGORY_REFERENCE_TAXONOMY_SOURCE,
    version: category.referenceTaxonomyVersion,
    categoryId: category.referenceTaxonomyCategoryId,
    name: category.referenceTaxonomyCategoryName,
    fullName: category.referenceTaxonomyCategoryFullName,
  };
}

function referenceTaxonomyForMapping(
  category: Category,
  mapping: Category["taxonomyMappings"][number],
): StoreCategoryTaxonomyReference {
  return {
    source: STORE_CATEGORY_REFERENCE_TAXONOMY_SOURCE,
    version:
      mapping.taxonomyVersion ?? category.referenceTaxonomyVersion ?? "unknown",
    categoryId: mapping.shopifyTaxonomyCategoryId,
    name:
      mapping.taxonomyCategoryName ??
      mapping.taxonomyCategoryFullName ??
      mapping.shopifyTaxonomyCategoryId,
    fullName:
      mapping.taxonomyCategoryFullName ??
      mapping.taxonomyCategoryName ??
      mapping.shopifyTaxonomyCategoryId,
  };
}

function actionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "The mapping could not be added. Check the admin server logs and retry.";
}

export function TaxonomyMappingEditor({ category }: { category: Category }) {
  const router = useRouter();
  const rootTaxonomy = useMemo(
    () => referenceTaxonomyForCategory(category),
    [category],
  );
  const [addReason, setAddReason] = useState("");
  const [addPendingCategoryId, setAddPendingCategoryId] = useState<string | null>(
    null,
  );
  const [recentlyAddedCategoryId, setRecentlyAddedCategoryId] = useState<
    string | null
  >(null);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    if (
      recentlyAddedCategoryId &&
      category.taxonomyMappings.some(
        (mapping) =>
          mapping.shopifyTaxonomyCategoryId === recentlyAddedCategoryId,
      )
    ) {
      setRecentlyAddedCategoryId(null);
    }
  }, [category.taxonomyMappings, recentlyAddedCategoryId]);

  const mappings: StoreCategoryMappingWorkspaceItem[] =
    category.taxonomyMappings.map((mapping) => ({
      id: mapping.id,
      taxonomy: referenceTaxonomyForMapping(category, mapping),
      weight: mapping.weight,
    }));
  const mappingsById = new Map(
    category.taxonomyMappings.map((mapping) => [mapping.id, mapping]),
  );

  async function addMapping(taxonomy: StoreCategoryTaxonomyReference | null) {
    if (!taxonomy || addPendingCategoryId) return;
    const reason = addReason.trim();
    if (!reason) {
      setAddError("Enter an audit reason before adding a mapping.");
      return;
    }

    const formData = new FormData();
    formData.set("intent", "create-taxonomy-mapping");
    formData.set("categoryId", category.id);
    formData.set("shopifyTaxonomyCategoryId", taxonomy.categoryId);
    formData.set("taxonomySource", taxonomy.source);
    formData.set("taxonomyVersion", taxonomy.version);
    formData.set("taxonomyCategoryName", taxonomy.name);
    formData.set("taxonomyCategoryFullName", taxonomy.fullName);
    formData.set("weight", "1");
    formData.set("reason", reason);

    setAddError(null);
    setAddPendingCategoryId(taxonomy.categoryId);
    try {
      await mutateStoreCategoryCatalogueAction(formData);
      setRecentlyAddedCategoryId(taxonomy.categoryId);
      router.refresh();
    } catch (error) {
      setAddError(actionErrorMessage(error));
    } finally {
      setAddPendingCategoryId(null);
    }
  }

  const unavailableSelections = [
    ...(addPendingCategoryId
      ? [
          {
            categoryId: addPendingCategoryId,
            reason: "This mapping is being added.",
            actionLabel: "Adding…",
          },
        ]
      : []),
    ...(recentlyAddedCategoryId
      ? [
          {
            categoryId: recentlyAddedCategoryId,
            reason: "This mapping was just added and is refreshing.",
            actionLabel: "Added",
          },
        ]
      : []),
  ];

  return (
    <section aria-labelledby="category-taxonomy-mappings-title">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h3
            id="category-taxonomy-mappings-title"
            className="text-lg font-semibold text-gray-950"
          >
            Category mappings
          </h3>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Search Shopify&apos;s Standard Product Taxonomy as Moda&apos;s reference taxonomy.
            Shopify consumes the exact taxonomy ID; WooCommerce can consume the persisted
            name/full path. During onboarding, matching mapping weights are summed for each
            Store Category; the highest score wins.
          </p>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
          {category.taxonomyMappings.length} mapping
          {category.taxonomyMappings.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-5">
        <StoreCategoryMappingWorkspace
          pickerId={`maintain-shopify-taxonomy-${category.id}`}
          rootTaxonomy={rootTaxonomy}
          mappings={mappings}
          unavailableSelections={unavailableSelections}
          selectionDisabled={Boolean(addPendingCategoryId)}
          onAdd={addMapping}
          addContext={
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Audit reason for additions
                <input
                  className={inputClass}
                  value={addReason}
                  onChange={(event) => setAddReason(event.target.value)}
                  maxLength={1000}
                  placeholder="Why is this mapping being added?"
                />
              </label>
              {addError ? (
                <p className="mt-2 text-sm font-medium text-red-700" role="alert">
                  {addError}
                </p>
              ) : null}
            </div>
          }
          emptyMessage="No Category mappings yet. Mappings are optional and can be added at any time."
          renderMappingControls={(mapping) => {
            const persistedMapping = mappingsById.get(mapping.id);
            if (!persistedMapping || !mapping.taxonomy) return null;

            return (
              <div className="space-y-3">
                <form
                  action={mutateStoreCategoryCatalogueAction}
                  className="grid gap-3 sm:grid-cols-[8rem_minmax(12rem,1fr)_auto] sm:items-end"
                >
                  <input
                    type="hidden"
                    name="intent"
                    value="update-taxonomy-mapping"
                  />
                  <input type="hidden" name="id" value={persistedMapping.id} />
                  <label className="text-sm font-medium text-gray-700">
                    Weight
                    <input
                      className={inputClass}
                      name="weight"
                      type="number"
                      min={1}
                      max={1_000_000}
                      defaultValue={persistedMapping.weight}
                      required
                    />
                  </label>
                  <label className="text-sm font-medium text-gray-700">
                    Audit reason
                    <input
                      className={inputClass}
                      name="reason"
                      maxLength={1000}
                      placeholder="Why is the weight changing?"
                      required
                    />
                  </label>
                  <button
                    className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                    type="submit"
                  >
                    Save
                  </button>
                </form>

                <form
                  action={mutateStoreCategoryCatalogueAction}
                  className="flex flex-col gap-3 border-t border-gray-100 pt-3 sm:flex-row sm:items-end sm:justify-end"
                >
                  <input type="hidden" name="intent" value="remove-taxonomy-mapping" />
                  <input type="hidden" name="id" value={persistedMapping.id} />
                  <label className="w-full text-sm font-medium text-gray-700 sm:max-w-md">
                    Removal audit reason
                    <input
                      className={inputClass}
                      name="reason"
                      maxLength={1000}
                      placeholder="Why is this mapping being removed?"
                      required
                    />
                  </label>
                  <button
                    className="rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-50"
                    type="submit"
                  >
                    Remove
                  </button>
                </form>
              </div>
            );
          }}
        />
      </div>
    </section>
  );
}
