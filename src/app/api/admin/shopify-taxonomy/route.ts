import { NextResponse } from "next/server";

import {
  browseShopifyTaxonomy,
  getShopifyTaxonomyCatalogue,
  resolveShopifyTaxonomyCategory,
  searchShopifyTaxonomy,
  ShopifyTaxonomyInvalidQueryError,
  ShopifyTaxonomyUnavailableError,
} from "@/lib/admin/shopify-taxonomy";
import {
  PlatformAdminUnauthorizedError,
  requirePlatformAdminRead,
} from "@/lib/auth/platform-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

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
    const catalogue = await getShopifyTaxonomyCatalogue();
    const params = new URL(request.url).searchParams;
    const id = params.get("id");
    const query = params.get("q");
    const parent = params.get("parent");
    const limit = params.get("limit");

    if (id) {
      const category = resolveShopifyTaxonomyCategory(catalogue, id);
      if (!category) {
        return NextResponse.json(
          { error: "not_found", version: catalogue.version },
          { status: 404, headers: NO_STORE_HEADERS },
        );
      }
      return NextResponse.json(
        { mode: "resolve", version: catalogue.version, category },
        { headers: NO_STORE_HEADERS },
      );
    }

    if (query) {
      return NextResponse.json(
        {
          mode: "search",
          version: catalogue.version,
          categories: searchShopifyTaxonomy(catalogue, query, limit),
        },
        { headers: NO_STORE_HEADERS },
      );
    }

    const browse = browseShopifyTaxonomy(catalogue, parent);
    return NextResponse.json(
      {
        mode: "browse",
        version: catalogue.version,
        ...browse,
      },
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
