import { gunzipSync } from "node:zlib";

export const SHOPIFY_TAXONOMY_VERSION = "2026-08";
export const SHOPIFY_TAXONOMY_ASSET_URL =
  `https://github.com/Shopify/product-taxonomy/releases/download/v${SHOPIFY_TAXONOMY_VERSION}/categories.en.json.gz`;

const SHOPIFY_TAXONOMY_FETCH_TIMEOUT_MS = 10_000;
const SHOPIFY_TAXONOMY_MAX_COMPRESSED_BYTES = 5 * 1024 * 1024;
const SHOPIFY_TAXONOMY_MAX_DECOMPRESSED_BYTES = 64 * 1024 * 1024;
const SHOPIFY_TAXONOMY_DEFAULT_LIMIT = 30;
const SHOPIFY_TAXONOMY_MAX_LIMIT = 50;

export type ShopifyTaxonomyAncestor = {
  id: string;
  name: string;
};

export type ShopifyTaxonomyCategory = {
  id: string;
  level: number;
  name: string;
  fullName: string;
  parentId: string | null;
  hasChildren: boolean;
  ancestors: ShopifyTaxonomyAncestor[];
};

export type ShopifyTaxonomyCatalogue = {
  version: string;
  categories: ShopifyTaxonomyCategory[];
  byId: Map<string, ShopifyTaxonomyCategory>;
};

type ShopifyTaxonomyDistributionCategory = {
  id?: unknown;
  level?: unknown;
  name?: unknown;
  full_name?: unknown;
  parent_id?: unknown;
  children?: unknown;
  ancestors?: unknown;
};

type ShopifyTaxonomyDistributionVertical = {
  categories?: unknown;
};

type ShopifyTaxonomyDistribution = {
  version?: unknown;
  verticals?: unknown;
};

export class ShopifyTaxonomyUnavailableError extends Error {
  constructor(message = "Shopify taxonomy is unavailable.") {
    super(message);
    this.name = "ShopifyTaxonomyUnavailableError";
  }
}

export class ShopifyTaxonomyInvalidQueryError extends Error {
  constructor(message = "Shopify taxonomy query is invalid.") {
    super(message);
    this.name = "ShopifyTaxonomyInvalidQueryError";
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ShopifyTaxonomyUnavailableError(
      `Shopify taxonomy distribution is missing ${field}.`,
    );
  }
  return value.trim();
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredLevel(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new ShopifyTaxonomyUnavailableError(
      "Shopify taxonomy distribution contains an invalid level.",
    );
  }
  return Number(value);
}

function parseAncestors(value: unknown): ShopifyTaxonomyAncestor[] {
  if (!Array.isArray(value)) return [];
  return value.map((ancestor) => {
    if (!ancestor || typeof ancestor !== "object") {
      throw new ShopifyTaxonomyUnavailableError(
        "Shopify taxonomy distribution contains an invalid ancestor.",
      );
    }
    const candidate = ancestor as Record<string, unknown>;
    return {
      id: requiredString(candidate.id, "ancestor id"),
      name: requiredString(candidate.name, "ancestor name"),
    };
  });
}

function hasChildren(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Convert Shopify's official categories.<locale>.json distribution into the
 * compact shape the Admin UI needs. Keeping this parser independent from the
 * network loader makes the release format testable without a live download.
 */
export function buildShopifyTaxonomyCatalogue(
  raw: unknown,
): ShopifyTaxonomyCatalogue {
  if (!raw || typeof raw !== "object") {
    throw new ShopifyTaxonomyUnavailableError(
      "Shopify taxonomy distribution is invalid.",
    );
  }

  const distribution = raw as ShopifyTaxonomyDistribution;
  const version = requiredString(distribution.version, "version");
  if (!Array.isArray(distribution.verticals)) {
    throw new ShopifyTaxonomyUnavailableError(
      "Shopify taxonomy distribution is missing verticals.",
    );
  }

  const byId = new Map<string, ShopifyTaxonomyCategory>();

  for (const verticalValue of distribution.verticals) {
    if (!verticalValue || typeof verticalValue !== "object") continue;
    const vertical = verticalValue as ShopifyTaxonomyDistributionVertical;
    if (!Array.isArray(vertical.categories)) continue;

    for (const categoryValue of vertical.categories) {
      if (!categoryValue || typeof categoryValue !== "object") continue;
      const category = categoryValue as ShopifyTaxonomyDistributionCategory;
      const id = requiredString(category.id, "category id");
      const parsed: ShopifyTaxonomyCategory = {
        id,
        level: requiredLevel(category.level),
        name: requiredString(category.name, "category name"),
        fullName: requiredString(category.full_name, "category full_name"),
        parentId: optionalString(category.parent_id),
        hasChildren: hasChildren(category.children),
        ancestors: parseAncestors(category.ancestors),
      };

      const existing = byId.get(id);
      if (existing && existing.fullName !== parsed.fullName) {
        throw new ShopifyTaxonomyUnavailableError(
          `Shopify taxonomy contains duplicate category id ${id}.`,
        );
      }
      byId.set(id, parsed);
    }
  }

  const categories = [...byId.values()].sort((left, right) =>
    left.fullName.localeCompare(right.fullName),
  );
  if (categories.length === 0) {
    throw new ShopifyTaxonomyUnavailableError(
      "Shopify taxonomy distribution contains no categories.",
    );
  }

  return { version, categories, byId };
}

function parseLimit(value: string | null): number {
  if (value === null || value === "") return SHOPIFY_TAXONOMY_DEFAULT_LIMIT;
  if (!/^\d+$/.test(value)) throw new ShopifyTaxonomyInvalidQueryError();
  const parsed = Number(value);
  if (parsed < 1 || parsed > SHOPIFY_TAXONOMY_MAX_LIMIT) {
    throw new ShopifyTaxonomyInvalidQueryError();
  }
  return parsed;
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase("en");
}

function scoreCategory(
  category: ShopifyTaxonomyCategory,
  normalizedQuery: string,
): number | null {
  const name = category.name.toLocaleLowerCase("en");
  const fullName = category.fullName.toLocaleLowerCase("en");
  const id = category.id.toLocaleLowerCase("en");

  if (name === normalizedQuery) return 0;
  if (name.startsWith(normalizedQuery)) return 1;
  if (fullName.startsWith(normalizedQuery)) return 2;
  if (name.includes(normalizedQuery)) return 3;
  if (fullName.includes(normalizedQuery)) return 4;
  if (id.includes(normalizedQuery)) return 5;
  return null;
}

export function searchShopifyTaxonomy(
  catalogue: ShopifyTaxonomyCatalogue,
  query: string,
  limitValue?: string | null,
): ShopifyTaxonomyCategory[] {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery || normalizedQuery.length > 200) {
    throw new ShopifyTaxonomyInvalidQueryError();
  }
  const limit = parseLimit(limitValue ?? null);

  return catalogue.categories
    .map((category) => ({
      category,
      score: scoreCategory(category, normalizedQuery),
    }))
    .filter(
      (candidate): candidate is { category: ShopifyTaxonomyCategory; score: number } =>
        candidate.score !== null,
    )
    .sort(
      (left, right) =>
        left.score - right.score ||
        left.category.fullName.localeCompare(right.category.fullName),
    )
    .slice(0, limit)
    .map(({ category }) => category);
}

export function browseShopifyTaxonomy(
  catalogue: ShopifyTaxonomyCatalogue,
  parentId: string | null,
): {
  parent: ShopifyTaxonomyCategory | null;
  breadcrumbs: ShopifyTaxonomyAncestor[];
  categories: ShopifyTaxonomyCategory[];
} {
  const normalizedParentId = parentId?.trim() || null;
  const parent = normalizedParentId
    ? catalogue.byId.get(normalizedParentId) ?? null
    : null;
  if (normalizedParentId && !parent) {
    throw new ShopifyTaxonomyInvalidQueryError(
      "Shopify taxonomy parent category was not found.",
    );
  }

  const categories = catalogue.categories.filter(
    (category) => category.parentId === normalizedParentId,
  );
  const breadcrumbs = parent ? [...parent.ancestors, { id: parent.id, name: parent.name }] : [];

  return { parent, breadcrumbs, categories };
}

export function resolveShopifyTaxonomyCategory(
  catalogue: ShopifyTaxonomyCatalogue,
  id: string,
): ShopifyTaxonomyCategory | null {
  const normalizedId = id.trim();
  if (!normalizedId || normalizedId.length > 255) {
    throw new ShopifyTaxonomyInvalidQueryError();
  }
  return catalogue.byId.get(normalizedId) ?? null;
}

let cataloguePromise: Promise<ShopifyTaxonomyCatalogue> | null = null;

async function downloadShopifyTaxonomy(): Promise<ShopifyTaxonomyCatalogue> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    SHOPIFY_TAXONOMY_FETCH_TIMEOUT_MS,
  );

  try {
    const response = await fetch(SHOPIFY_TAXONOMY_ASSET_URL, {
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "application/octet-stream" },
    });
    if (!response.ok) throw new ShopifyTaxonomyUnavailableError();

    const declaredLength = Number(response.headers.get("content-length"));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > SHOPIFY_TAXONOMY_MAX_COMPRESSED_BYTES
    ) {
      throw new ShopifyTaxonomyUnavailableError(
        "Shopify taxonomy download exceeded the compressed size limit.",
      );
    }

    const compressed = new Uint8Array(await response.arrayBuffer());
    if (compressed.byteLength > SHOPIFY_TAXONOMY_MAX_COMPRESSED_BYTES) {
      throw new ShopifyTaxonomyUnavailableError(
        "Shopify taxonomy download exceeded the compressed size limit.",
      );
    }

    const decompressed = gunzipSync(Buffer.from(compressed), {
      maxOutputLength: SHOPIFY_TAXONOMY_MAX_DECOMPRESSED_BYTES,
    });
    if (decompressed.byteLength > SHOPIFY_TAXONOMY_MAX_DECOMPRESSED_BYTES) {
      throw new ShopifyTaxonomyUnavailableError(
        "Shopify taxonomy download exceeded the decompressed size limit.",
      );
    }

    let raw: unknown;
    try {
      raw = JSON.parse(decompressed.toString("utf8"));
    } catch {
      throw new ShopifyTaxonomyUnavailableError(
        "Shopify taxonomy distribution could not be parsed.",
      );
    }

    return buildShopifyTaxonomyCatalogue(raw);
  } catch (error) {
    if (error instanceof ShopifyTaxonomyUnavailableError) throw error;
    throw new ShopifyTaxonomyUnavailableError();
  } finally {
    clearTimeout(timeout);
  }
}

export async function getShopifyTaxonomyCatalogue(): Promise<ShopifyTaxonomyCatalogue> {
  if (!cataloguePromise) {
    cataloguePromise = downloadShopifyTaxonomy().catch((error) => {
      cataloguePromise = null;
      throw error;
    });
  }
  return cataloguePromise;
}

export function resetShopifyTaxonomyCatalogueForTests() {
  cataloguePromise = null;
}
