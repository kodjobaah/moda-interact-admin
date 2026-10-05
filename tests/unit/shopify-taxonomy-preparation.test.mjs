import assert from "node:assert/strict";
import { test } from "node:test";

import { parseShopifyTaxonomyText } from "../../scripts/shopify-taxonomy-distribution.mjs";

const sourceUrl =
  "https://github.com/Shopify/product-taxonomy/releases/download/v2026-08/categories.en.txt.gz";

const fixture = `# Shopify Product Taxonomy - Categories: 2026-08
# Format: {GID} : {Ancestor name} > ... > {Category name}

gid://shopify/TaxonomyCategory/aa       : Apparel & Accessories
gid://shopify/TaxonomyCategory/aa-1     : Apparel & Accessories > Clothing
gid://shopify/TaxonomyCategory/aa-1-9   : Apparel & Accessories > Clothing > Shirts & Tops
`;

test("preparation parser builds hierarchy from Shopify's compact text distribution", () => {
  const snapshot = parseShopifyTaxonomyText(fixture, "2026-08", sourceUrl);

  assert.equal(snapshot.version, "2026-08");
  assert.equal(snapshot.sourceUrl, sourceUrl);
  assert.equal(snapshot.categories.length, 3);

  const root = snapshot.categories.find(
    (category) => category.id === "gid://shopify/TaxonomyCategory/aa",
  );
  const leaf = snapshot.categories.find(
    (category) => category.id === "gid://shopify/TaxonomyCategory/aa-1-9",
  );

  assert.equal(root?.level, 0);
  assert.equal(root?.hasChildren, true);
  assert.deepEqual(leaf, {
    id: "gid://shopify/TaxonomyCategory/aa-1-9",
    level: 2,
    name: "Shirts & Tops",
    fullName: "Apparel & Accessories > Clothing > Shirts & Tops",
    parentId: "gid://shopify/TaxonomyCategory/aa-1",
    hasChildren: false,
    ancestors: [
      { id: "gid://shopify/TaxonomyCategory/aa", name: "Apparel & Accessories" },
      { id: "gid://shopify/TaxonomyCategory/aa-1", name: "Clothing" },
    ],
  });
});

test("preparation parser rejects a distribution from the wrong Shopify release", () => {
  assert.throws(
    () => parseShopifyTaxonomyText(fixture, "2026-09", sourceUrl),
    /expected version 2026-09 but received 2026-08/,
  );
});
