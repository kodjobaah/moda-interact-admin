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
import { suggestStoreCategoryMappingConditionKey } from "./store-category-mapping-condition";

type Category = StoreCategoryCatalogue["categories"][number];
const inputClass =
  "mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)] disabled:bg-gray-100 disabled:text-gray-500";

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
      conditionKey: mapping.conditionKey,
      displayName: mapping.displayName,
      weight: mapping.weight,
      statusLabel: mapping.conditionKey ? undefined : "Condition key required",
    }));
  const mappingsById = new Map(
    category.taxonomyMappings.map((mapping) => [mapping.id, mapping]),
  );

  async function addMapping(taxonomy: StoreCategoryTaxonomyReference | null) {
    if (!taxonomy || addPendingCategoryId || category.enabled) return;
    const reason = addReason.trim();
    if (!reason) {
      setAddError("Enter an audit reason before adding a mapping.");
      return;
    }

    const conditionKey = suggestStoreCategoryMappingConditionKey(
      taxonomy.name,
      category.taxonomyMappings.flatMap((mapping) =>
        mapping.conditionKey ? [mapping.conditionKey] : [],
      ),
    );
    const formData = new FormData();
    formData.set("intent", "create-taxonomy-mapping");
    formData.set("categoryId", category.id);
    formData.set("shopifyTaxonomyCategoryId", taxonomy.categoryId);
    formData.set("taxonomySource", taxonomy.source);
    formData.set("taxonomyVersion", taxonomy.version);
    formData.set("taxonomyCategoryName", taxonomy.name);
    formData.set("taxonomyCategoryFullName", taxonomy.fullName);
    formData.set("conditionKey", conditionKey);
    formData.set("displayName", taxonomy.name);
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
            Mappings still drive Store Category suggestion scores, but they now also
            define merchant-visible choices and stable conditions such as
            <span className="font-mono"> mappings.shoes</span> for the category prompt.
          </p>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
          {category.taxonomyMappings.length} mapping
          {category.taxonomyMappings.length === 1 ? "" : "s"}
        </span>
      </div>

      {category.enabled ? (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800">
          This Store Category is enabled. Disable it before changing mapping identity,
          labels, weights, or prompt conditions.
        </p>
      ) : null}

      <div className="mt-5">
        <StoreCategoryMappingWorkspace
          pickerId={`maintain-shopify-taxonomy-${category.id}`}
          rootTaxonomy={rootTaxonomy}
          mappings={mappings}
          unavailableSelections={unavailableSelections}
          selectionDisabled={Boolean(addPendingCategoryId) || category.enabled}
          onAdd={addMapping}
          addContext={
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Audit reason for additions
                <input
                  className={inputClass}
                  value={addReason}
                  disabled={category.enabled}
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
          emptyMessage="No Category mappings yet. The conditional prompt may remain unconditional, or mappings can be added before translation."
          renderMappingControls={(mapping) => {
            const persistedMapping = mappingsById.get(mapping.id);
            if (!persistedMapping || !mapping.taxonomy) return null;

            if (category.enabled) {
              return (
                <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
                  Disable this Store Category to edit or remove this mapping.
                </p>
              );
            }

            return (
              <div className="space-y-3">
                <form
                  action={mutateStoreCategoryCatalogueAction}
                  className="grid gap-3 lg:grid-cols-[minmax(11rem,1fr)_minmax(11rem,1fr)_7rem_minmax(12rem,1fr)_auto] lg:items-end"
                >
                  <input
                    type="hidden"
                    name="intent"
                    value="update-taxonomy-mapping"
                  />
                  <input type="hidden" name="id" value={persistedMapping.id} />
                  <input
                    type="hidden"
                    name="expectedEditVersion"
                    value={persistedMapping.editVersion}
                  />
                  <label className="text-sm font-medium text-gray-700">
                    Merchant display name
                    <input
                      className={inputClass}
                      name="displayName"
                      defaultValue={
                        persistedMapping.displayName ??
                        persistedMapping.taxonomyCategoryName ??
                        ""
                      }
                      maxLength={255}
                      required
                    />
                  </label>
                  <label className="text-sm font-medium text-gray-700">
                    Condition key
                    {persistedMapping.conditionKey ? (
                      <>
                        <input
                          type="hidden"
                          name="conditionKey"
                          value={persistedMapping.conditionKey}
                        />
                        <input
                          className={`${inputClass} font-mono`}
                          value={persistedMapping.conditionKey}
                          disabled
                          readOnly
                        />
                      </>
                    ) : (
                      <input
                        className={`${inputClass} font-mono`}
                        name="conditionKey"
                        defaultValue={suggestStoreCategoryMappingConditionKey(
                          persistedMapping.taxonomyCategoryName ?? mapping.taxonomy.name,
                          category.taxonomyMappings.flatMap((candidate) =>
                            candidate.conditionKey ? [candidate.conditionKey] : [],
                          ),
                        )}
                        pattern="[a-z][a-z0-9_]{0,127}"
                        maxLength={128}
                        required
                      />
                    )}
                    <span className="mt-1 block text-xs font-normal text-gray-500">
                      Immutable after first assignment.
                    </span>
                  </label>
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
                      placeholder="Why is this mapping changing?"
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
                  <input
                    type="hidden"
                    name="expectedEditVersion"
                    value={persistedMapping.editVersion}
                  />
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
