import { createLogger } from "@modainteract/moda-interact-shared/logging";
import { NextResponse } from "next/server";

import {
  browseShopifyTaxonomy,
  resolveShopifyTaxonomyCategory,
  searchShopifyTaxonomy,
  ShopifyTaxonomyInvalidQueryError,
  ShopifyTaxonomyUnavailableError,
} from "@/lib/admin/shopify-taxonomy";
import { resolveDeploymentEnvironmentName } from "@/lib/auth/environment";
import {
  PlatformAdminUnauthorizedError,
  requirePlatformAdminRead,
} from "@/lib/auth/platform-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

const taxonomyLogger = createLogger({
  serviceNamespace: "moda-interact",
  serviceName: "moda-interact-admin",
  environment: resolveDeploymentEnvironmentName(),
});

export async function GET(request: Request) {
  try {
    await requirePlatformAdminRead();
  } catch (error) {
    if (error instanceof PlatformAdminUnauthorizedError) {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    }
    return NextResponse.json(
      { error: "unavailable" },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const params = new URL(request.url).searchParams;
    const id = params.get("id");
    const query = params.get("q");
    const parent = params.get("parent");
    const limit = params.get("limit");
    const scopeValue = params.get("scope");
    const rootId = params.get("root");
    const scope =
      scopeValue === "top-level" || scopeValue === "subcategories"
        ? scopeValue
        : "all";

    if (id) {
      const resolved = await resolveShopifyTaxonomyCategory(id, scope);
      if (!resolved.category) {
        return NextResponse.json(
          { error: "not_found", version: resolved.version },
          { status: 404, headers: NO_STORE_HEADERS },
        );
      }
      return NextResponse.json(
        { mode: "resolve", ...resolved },
        { headers: NO_STORE_HEADERS },
      );
    }

    if (query) {
      const result = await searchShopifyTaxonomy({
        query,
        limitValue: limit,
        scope,
        rootId,
      });
      return NextResponse.json(
        { mode: "search", ...result },
        { headers: NO_STORE_HEADERS },
      );
    }

    if (scope === "top-level" && parent) {
      throw new ShopifyTaxonomyInvalidQueryError(
        "Top-level taxonomy browsing cannot descend into subcategories.",
      );
    }

    const effectiveParent =
      scope === "subcategories" && !parent && rootId ? rootId : parent;
    const browse = await browseShopifyTaxonomy(effectiveParent);
    return NextResponse.json(
      { mode: "browse", ...browse },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    if (error instanceof ShopifyTaxonomyInvalidQueryError) {
      return NextResponse.json(
        { error: "invalid_query" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }
    if (error instanceof ShopifyTaxonomyUnavailableError) {
      taxonomyLogger.info("admin.shopify_taxonomy.unavailable", {
        code: error.code,
        detail: error.detail,
      });
      if (error.code === "EMBEDDING_CONFIGURATION") {
        return NextResponse.json(
          {
            error: "embedding_configuration",
            reason:
              error.detail === "MISSING_API_KEY"
                ? "missing_api_key"
                : "invalid_index_metadata",
          },
          { status: 503, headers: NO_STORE_HEADERS },
        );
      }
      if (error.code === "EMBEDDING_REQUEST_FAILED") {
        return NextResponse.json(
          { error: "embedding_request_failed" },
          { status: 503, headers: NO_STORE_HEADERS },
        );
      }
      return NextResponse.json(
        { error: "unavailable" },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }
    return NextResponse.json(
      { error: "unavailable" },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}
