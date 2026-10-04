import assert from "node:assert/strict";
import { test } from "node:test";

import {
  browseShopifyTaxonomy,
  buildShopifyTaxonomyCatalogue,
  resolveShopifyTaxonomyCategory,
  searchShopifyTaxonomy,
  ShopifyTaxonomyInvalidQueryError,
} from "../../src/lib/admin/shopify-taxonomy.ts";

const fixture = {
  version: "2026-08",
  verticals: [
    {
      name: "Apparel & Accessories",
      prefix: "aa",
      categories: [
        {
          id: "gid://shopify/TaxonomyCategory/aa",
          level: 0,
          name: "Apparel & Accessories",
          full_name: "Apparel & Accessories",
          parent_id: null,
          children: [
            { id: "gid://shopify/TaxonomyCategory/aa-1", name: "Clothing" },
          ],
          ancestors: [],
        },
        {
          id: "gid://shopify/TaxonomyCategory/aa-1",
          level: 1,
          name: "Clothing",
          full_name: "Apparel & Accessories > Clothing",
          parent_id: "gid://shopify/TaxonomyCategory/aa",
          children: [
            { id: "gid://shopify/TaxonomyCategory/aa-1-9", name: "Shirts & Tops" },
          ],
          ancestors: [
            { id: "gid://shopify/TaxonomyCategory/aa", name: "Apparel & Accessories" },
          ],
        },
        {
          id: "gid://shopify/TaxonomyCategory/aa-1-9",
          level: 2,
          name: "Shirts & Tops",
          full_name: "Apparel & Accessories > Clothing > Shirts & Tops",
          parent_id: "gid://shopify/TaxonomyCategory/aa-1",
          children: [],
          ancestors: [
            { id: "gid://shopify/TaxonomyCategory/aa", name: "Apparel & Accessories" },
            { id: "gid://shopify/TaxonomyCategory/aa-1", name: "Clothing" },
          ],
        },
      ],
    },
  ],
};

test("builds the compact Shopify taxonomy catalogue from the official distribution shape", () => {
  const catalogue = buildShopifyTaxonomyCatalogue(fixture);

  assert.equal(catalogue.version, "2026-08");
  assert.equal(catalogue.categories.length, 3);
  assert.deepEqual(catalogue.byId.get("gid://shopify/TaxonomyCategory/aa-1"), {
    id: "gid://shopify/TaxonomyCategory/aa-1",
    level: 1,
    name: "Clothing",
    fullName: "Apparel & Accessories > Clothing",
    parentId: "gid://shopify/TaxonomyCategory/aa",
    hasChildren: true,
    ancestors: [
      { id: "gid://shopify/TaxonomyCategory/aa", name: "Apparel & Accessories" },
    ],
  });
});

test("search ranks familiar category names and keeps results bounded", () => {
  const catalogue = buildShopifyTaxonomyCatalogue(fixture);
  const results = searchShopifyTaxonomy(catalogue, "shirt", "1");

  assert.equal(results.length, 1);
  assert.equal(results[0]?.id, "gid://shopify/TaxonomyCategory/aa-1-9");
});

test("browse returns roots, children, and breadcrumb context", () => {
  const catalogue = buildShopifyTaxonomyCatalogue(fixture);

  const roots = browseShopifyTaxonomy(catalogue, null);
  assert.deepEqual(roots.categories.map((category) => category.id), [
    "gid://shopify/TaxonomyCategory/aa",
  ]);

  const clothing = browseShopifyTaxonomy(
    catalogue,
    "gid://shopify/TaxonomyCategory/aa-1",
  );
  assert.equal(clothing.parent?.name, "Clothing");
  assert.deepEqual(clothing.breadcrumbs, [
    { id: "gid://shopify/TaxonomyCategory/aa", name: "Apparel & Accessories" },
    { id: "gid://shopify/TaxonomyCategory/aa-1", name: "Clothing" },
  ]);
  assert.equal(clothing.categories[0]?.name, "Shirts & Tops");
});

test("resolve returns the exact Shopify GID and invalid query limits are rejected", () => {
  const catalogue = buildShopifyTaxonomyCatalogue(fixture);

  assert.equal(
    resolveShopifyTaxonomyCategory(
      catalogue,
      "gid://shopify/TaxonomyCategory/aa-1-9",
    )?.fullName,
    "Apparel & Accessories > Clothing > Shirts & Tops",
  );

  assert.throws(
    () => searchShopifyTaxonomy(catalogue, "shirt", "999"),
    ShopifyTaxonomyInvalidQueryError,
  );
});
