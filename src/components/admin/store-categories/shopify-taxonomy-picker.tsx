"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  STORE_CATEGORY_REFERENCE_TAXONOMY_SOURCE,
  type StoreCategoryTaxonomyReference,
} from "@/lib/admin/store-category-taxonomy-reference";

type ShopifyTaxonomyAncestor = {
  id: string;
  name: string;
};

type ShopifyTaxonomyCategory = {
  id: string;
  level: number;
  name: string;
  fullName: string;
  parentId: string | null;
  hasChildren: boolean;
  ancestors: ShopifyTaxonomyAncestor[];
};

type BrowseResponse = {
  mode: "browse";
  version: string;
  parent: ShopifyTaxonomyCategory | null;
  breadcrumbs: ShopifyTaxonomyAncestor[];
  categories: ShopifyTaxonomyCategory[];
};

type SearchResponse = {
  mode: "search";
  version: string;
  categories: ShopifyTaxonomyCategory[];
};

type ResolveResponse = {
  mode: "resolve";
  version: string;
  category: ShopifyTaxonomyCategory;
};

type TaxonomyResponse = BrowseResponse | SearchResponse | ResolveResponse;

type TaxonomyApiError = {
  error?: string;
  reason?: string;
};

class TaxonomyFetchError extends Error {
  readonly code: string;
  readonly reason: string | null;

  constructor(code: string, reason: string | null = null) {
    super(code);
    this.name = "TaxonomyFetchError";
    this.code = code;
    this.reason = reason;
  }
}

type UnavailableTaxonomySelection = {
  categoryId: string;
  reason: string;
  actionLabel?: string;
};

type ShopifyTaxonomyPickerProps = {
  id: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  required?: boolean;
  scope?: "all" | "top-level" | "subcategories";
  rootId?: string | null;
  allowRawId?: boolean;
  fallbackSelection?: StoreCategoryTaxonomyReference | null;
  unavailableSelections?: UnavailableTaxonomySelection[];
  showSelectionSummary?: boolean;
  selectionActionLabel?: string;
  selectionPendingLabel?: string;
  selectionDisabled?: boolean;
  onChange?: (taxonomyCategoryId: string) => void;
  onSelectionChange?: (selection: StoreCategoryTaxonomyReference | null) => void;
};

const inputClass =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)]";

function taxonomySelection(
  category: ShopifyTaxonomyCategory,
  version: string,
): StoreCategoryTaxonomyReference {
  return {
    source: STORE_CATEGORY_REFERENCE_TAXONOMY_SOURCE,
    version,
    categoryId: category.id,
    name: category.name,
    fullName: category.fullName,
  };
}

async function fetchTaxonomy(
  params: URLSearchParams,
  signal: AbortSignal,
): Promise<TaxonomyResponse> {
  const response = await fetch(`/api/admin/shopify-taxonomy?${params.toString()}`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    let payload: TaxonomyApiError = {};
    try {
      payload = (await response.json()) as TaxonomyApiError;
    } catch {
      // Keep the bounded generic error when the response is not JSON.
    }
    throw new TaxonomyFetchError(
      payload.error?.trim() || "unavailable",
      payload.reason?.trim() || null,
    );
  }
  return (await response.json()) as TaxonomyResponse;
}

function taxonomySearchErrorMessage(error: unknown): string {
  if (error instanceof TaxonomyFetchError) {
    if (error.code === "embedding_configuration") {
      if (error.reason === "not_configured") {
        return "Reference taxonomy semantic search is unavailable because Reference Taxonomy embeddings are not configured. Open System Controls → Embeddings.";
      }
      if (error.reason === "configuration_mismatch") {
        return "Reference taxonomy embedding settings changed after this Redis index was built. Re-sync the taxonomy search index.";
      }
      if (error.reason === "runtime_configuration_unavailable") {
        return "Reference taxonomy embedding credentials could not be decrypted. Verify the Commerce credential keyring.";
      }
      if (error.reason === "missing_api_key") {
        return "Reference taxonomy semantic search is unavailable because the embedding credential is not configured.";
      }
      return "Reference taxonomy semantic search is unavailable because the active index embedding metadata is invalid. Re-sync the taxonomy search index.";
    }
    if (error.code === "embedding_request_failed") {
      return "Reference taxonomy semantic search could not reach the embedding service. Try again.";
    }
  }
  return "Reference taxonomy search is unavailable. Sync the taxonomy search index from Store Categories and verify the Reference Taxonomy embedding settings.";
}

function TaxonomyPath({ fullName }: { fullName: string }) {
  const segments = fullName.split(" > ");
  return (
    <span className="flex flex-wrap items-center gap-1">
      {segments.map((segment, index) => (
        <span key={`${segment}-${index}`} className="inline-flex items-center gap-1">
          {index > 0 ? <span className="text-gray-400">›</span> : null}
          <span>{segment}</span>
        </span>
      ))}
    </span>
  );
}

function useResolvedCategory(
  taxonomyCategoryId: string,
  scope: "all" | "top-level" | "subcategories" = "all",
  onNotFound?: (taxonomyCategoryId: string) => void,
) {
  const requestedId = taxonomyCategoryId.trim();
  const onNotFoundRef = useRef(onNotFound);
  const [resolution, setResolution] = useState<{
    requestedId: string;
    category: ShopifyTaxonomyCategory | null;
    version: string | null;
    unavailable: boolean;
    notFound: boolean;
  }>({
    requestedId: "",
    category: null,
    version: null,
    unavailable: false,
    notFound: false,
  });

  useEffect(() => {
    onNotFoundRef.current = onNotFound;
  }, [onNotFound]);

  useEffect(() => {
    if (!requestedId) return undefined;

    const controller = new AbortController();
    const params = new URLSearchParams({ id: requestedId });
    if (scope !== "all") params.set("scope", scope);
    void fetchTaxonomy(params, controller.signal)
      .then((response) => {
        if (response.mode !== "resolve") return;
        setResolution({
          requestedId,
          category: response.category,
          version: response.version,
          unavailable: false,
          notFound: false,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        const notFound =
          error instanceof TaxonomyFetchError && error.code === "not_found";
        setResolution({
          requestedId,
          category: null,
          version: null,
          unavailable: !notFound,
          notFound,
        });
        if (notFound) onNotFoundRef.current?.(requestedId);
      });

    return () => controller.abort();
  }, [requestedId, scope]);

  if (!requestedId || resolution.requestedId !== requestedId) {
    return {
      category: null,
      version: null,
      unavailable: false,
      notFound: false,
    };
  }

  return {
    category: resolution.category,
    version: resolution.version,
    unavailable: resolution.unavailable,
    notFound: resolution.notFound,
  };
}

export function ShopifyTaxonomyCategoryLabel({
  taxonomyCategoryId,
  compact = false,
}: {
  taxonomyCategoryId: string;
  compact?: boolean;
}) {
  const { category, unavailable } = useResolvedCategory(taxonomyCategoryId);

  if (!category) {
    return (
      <span className="min-w-0">
        <span className="block break-words font-medium text-gray-900">
          {taxonomyCategoryId}
        </span>
        {unavailable ? (
          <span className="mt-1 block text-xs text-amber-700">
            Reference taxonomy label unavailable
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span className="min-w-0">
      <span className="block font-medium text-gray-900">
        <TaxonomyPath fullName={category.fullName} />
      </span>
      {!compact ? (
        <span className="mt-1 block break-all font-mono text-xs text-gray-500">
          {category.id}
        </span>
      ) : null}
    </span>
  );
}

export function ShopifyTaxonomyPicker({
  id,
  name,
  value,
  defaultValue = "",
  required = false,
  scope = "all",
  rootId = null,
  allowRawId = true,
  fallbackSelection = null,
  unavailableSelections = [],
  showSelectionSummary = true,
  selectionActionLabel = "Select",
  selectionPendingLabel = "Selecting…",
  selectionDisabled = false,
  onChange,
  onSelectionChange,
}: ShopifyTaxonomyPickerProps) {
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [committedSelection, setCommittedSelection] =
    useState<StoreCategoryTaxonomyReference | null>(fallbackSelection);
  const selectedId = controlled ? value ?? "" : internalValue;

  function clearUnresolvableSelection(notFoundId: string) {
    if (allowRawId || notFoundId !== selectedId) return;
    commit("");
  }

  const {
    category: selectedCategory,
    version,
    unavailable: selectedUnavailable,
  } = useResolvedCategory(selectedId, scope, clearUnresolvableSelection);
  const [query, setQuery] = useState("");
  const [browseParentId, setBrowseParentId] = useState<string | null>(null);
  const [results, setResults] = useState<ShopifyTaxonomyCategory[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<ShopifyTaxonomyAncestor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catalogueVersion, setCatalogueVersion] = useState<string | null>(null);
  const [pendingSelectionId, setPendingSelectionId] = useState<string | null>(null);
  const searchGenerationRef = useRef(0);
  const selectionCommitRef = useRef(false);
  const selectionUnlockTimerRef = useRef<number | null>(null);

  const trimmedQuery = query.trim();
  const searchMode = trimmedQuery.length > 0;
  const displayedVersion = version ?? catalogueVersion;
  const unavailableSelectionsById = useMemo(
    () =>
      new Map(
        unavailableSelections.map((selection) => [
          selection.categoryId,
          selection,
        ]),
      ),
    [unavailableSelections],
  );

  function commit(
    nextValue: string,
    selection: StoreCategoryTaxonomyReference | null = null,
  ) {
    if (!controlled) setInternalValue(nextValue);
    setCommittedSelection(selection);
    onChange?.(nextValue);
    onSelectionChange?.(selection);
  }

  function commitResultSelection(category: ShopifyTaxonomyCategory) {
    if (
      selectionCommitRef.current ||
      category.id === selectedId ||
      unavailableSelectionsById.has(category.id)
    ) {
      return;
    }

    selectionCommitRef.current = true;
    setPendingSelectionId(category.id);
    commit(
      category.id,
      taxonomySelection(category, catalogueVersion ?? displayedVersion ?? ""),
    );

    if (selectionUnlockTimerRef.current !== null) {
      window.clearTimeout(selectionUnlockTimerRef.current);
    }
    selectionUnlockTimerRef.current = window.setTimeout(() => {
      selectionCommitRef.current = false;
      setPendingSelectionId(null);
      selectionUnlockTimerRef.current = null;
    }, 600);
  }

  useEffect(
    () => () => {
      if (selectionUnlockTimerRef.current !== null) {
        window.clearTimeout(selectionUnlockTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const generation = ++searchGenerationRef.current;
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => {
        const params = new URLSearchParams();
        if (scope !== "all") params.set("scope", scope);
        if (rootId) params.set("root", rootId);
        if (searchMode) {
          params.set("q", trimmedQuery);
          params.set("limit", "10");
        } else if (browseParentId) {
          params.set("parent", browseParentId);
        }

        setLoading(true);
        setError(null);
        void fetchTaxonomy(params, controller.signal)
          .then((response) => {
            if (generation !== searchGenerationRef.current) return;
            setCatalogueVersion(response.version);
            if (response.mode === "resolve") return;
            setResults(response.categories);
            setBreadcrumbs(response.mode === "browse" ? response.breadcrumbs : []);
          })
          .catch((fetchError: unknown) => {
            if (generation !== searchGenerationRef.current) return;
            if (
              fetchError instanceof DOMException &&
              fetchError.name === "AbortError"
            ) {
              return;
            }
            setResults([]);
            setBreadcrumbs([]);
            setError(taxonomySearchErrorMessage(fetchError));
          })
          .finally(() => {
            if (generation === searchGenerationRef.current) setLoading(false);
          });
      },
      searchMode ? 250 : 0,
    );

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [browseParentId, rootId, scope, searchMode, trimmedQuery]);

  const resolvedSelection = useMemo(() => {
    if (committedSelection?.categoryId === selectedId) return committedSelection;
    if (selectedCategory && displayedVersion) {
      return taxonomySelection(selectedCategory, displayedVersion);
    }
    if (fallbackSelection?.categoryId === selectedId) return fallbackSelection;
    return null;
  }, [
    committedSelection,
    displayedVersion,
    fallbackSelection,
    selectedCategory,
    selectedId,
  ]);
  const selectionDescription = useMemo(() => {
    if (resolvedSelection) return resolvedSelection.fullName;
    if (selectedId) return selectedId;
    return "No reference taxonomy category selected";
  }, [resolvedSelection, selectedId]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4" data-testid="shopify-taxonomy-picker">
      {name ? (
        <>
          <input type="hidden" name={name} value={selectedId} />
          <input
            type="hidden"
            name="taxonomySource"
            value={resolvedSelection?.source ?? ""}
          />
          <input
            type="hidden"
            name="taxonomyVersion"
            value={resolvedSelection?.version ?? ""}
          />
          <input
            type="hidden"
            name="taxonomyCategoryName"
            value={resolvedSelection?.name ?? ""}
          />
          <input
            type="hidden"
            name="taxonomyCategoryFullName"
            value={resolvedSelection?.fullName ?? ""}
          />
        </>
      ) : null}

      {showSelectionSummary ? (
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Selected reference category
            </p>
            <div className="mt-1 text-sm text-gray-900" aria-live="polite">
              {resolvedSelection ? (
                <span className="min-w-0">
                  <span className="block font-medium text-gray-900">
                    <TaxonomyPath fullName={resolvedSelection.fullName} />
                  </span>
                  <span className="mt-1 block break-all font-mono text-xs text-gray-500">
                    {resolvedSelection.categoryId}
                  </span>
                </span>
              ) : (
                <span className={selectedId ? "font-mono text-xs" : "text-gray-500"}>
                  {selectionDescription}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {displayedVersion ? (
              <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">
                Reference taxonomy · {displayedVersion}
              </span>
            ) : null}
            {selectedId ? (
              <button
                type="button"
                className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                onClick={() => commit("")}
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      ) : displayedVersion ? (
        <div className="flex justify-end">
          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">
            Reference taxonomy · {displayedVersion}
          </span>
        </div>
      ) : null}

      <div className={showSelectionSummary || displayedVersion ? "mt-4" : ""}>
        <label htmlFor={`${id}-search`} className="text-sm font-medium text-gray-700">
          Search reference taxonomy
        </label>
        <input
          id={`${id}-search`}
          className={`mt-1 ${inputClass}`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search for shirts, skincare, pet supplies..."
          autoComplete="off"
        />
      </div>

      {!searchMode ? (
        <nav className="mt-4" aria-label="Reference taxonomy hierarchy">
          <div className="flex flex-wrap items-center gap-1 text-sm">
            <button
              type="button"
              className="font-medium text-[var(--brand-700)] hover:text-[var(--brand-900)]"
              onClick={() => setBrowseParentId(null)}
            >
              Reference taxonomy
            </button>
            {breadcrumbs.map((breadcrumb) => (
              <span key={breadcrumb.id} className="inline-flex items-center gap-1">
                <span aria-hidden="true" className="text-gray-400">›</span>
                <button
                  type="button"
                  className="font-medium text-[var(--brand-700)] hover:text-[var(--brand-900)]"
                  onClick={() => setBrowseParentId(breadcrumb.id)}
                >
                  {breadcrumb.name}
                </button>
              </span>
            ))}
          </div>
        </nav>
      ) : null}

      <div className="mt-3 max-h-80 overflow-y-auto rounded-md border border-gray-200">
        {loading ? (
          <p className="p-4 text-sm text-gray-500" role="status">
            Loading reference taxonomy…
          </p>
        ) : error ? (
          <p className="p-4 text-sm text-amber-700" role="status">
            {error}
          </p>
        ) : results.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">
            {searchMode ? "No matching taxonomy categories." : "No child categories."}
          </p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {results.map((category) => {
              const unavailableSelection = unavailableSelectionsById.get(category.id);
              const unavailableReason = unavailableSelection?.reason;
              const alreadySelected = category.id === selectedId;
              const resultSelectionDisabled =
                selectionDisabled ||
                Boolean(unavailableSelection) ||
                alreadySelected ||
                pendingSelectionId !== null;

              return (
                <li
                  key={category.id}
                  className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-gray-900">
                      <TaxonomyPath fullName={category.fullName} />
                    </p>
                    <p className="mt-1 break-all font-mono text-xs text-gray-500">
                      {category.id}
                    </p>
                    {unavailableReason ? (
                      <p className="mt-1 text-xs font-medium text-amber-700">
                        {unavailableReason}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {scope !== "top-level" && category.hasChildren ? (
                      <button
                        type="button"
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                        onClick={() => {
                          setQuery("");
                          setBrowseParentId(category.id);
                        }}
                      >
                        Browse
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="rounded-md bg-[var(--brand-700)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--brand-800)] disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600"
                      disabled={resultSelectionDisabled}
                      title={unavailableReason ?? undefined}
                      onClick={() => commitResultSelection(category)}
                    >
                      {unavailableSelection
                        ? unavailableSelection.actionLabel ?? "Assigned"
                        : alreadySelected
                          ? "Selected"
                          : pendingSelectionId === category.id
                            ? selectionPendingLabel
                            : selectionActionLabel}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {allowRawId ? <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-gray-700">
          Advanced taxonomy ID
        </summary>
        <div className="mt-2">
          <label htmlFor={`${id}-raw`} className="text-xs text-gray-600">
            Use only when the reference taxonomy ID cannot be selected from the picker. The ID must still resolve before the mapping can be saved.
          </label>
          <input
            id={`${id}-raw`}
            className={`mt-1 ${inputClass} font-mono text-xs`}
            value={selectedId}
            maxLength={255}
            aria-required={required || undefined}
            onChange={(event) => commit(event.target.value)}
            placeholder="gid://shopify/TaxonomyCategory/aa-1"
          />
          {selectedUnavailable && selectedId ? (
            <p className="mt-1 text-xs text-amber-700">
              This ID could not be resolved in the current reference taxonomy.
            </p>
          ) : null}
        </div>
      </details> : null}
    </div>
  );
}
