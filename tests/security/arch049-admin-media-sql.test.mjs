import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("../../src/lib/admin/merchant-support.ts", import.meta.url), "utf8");
test("every merchant-support ShopBrand join follows the preserved commerce table migration", () => {
  assert.equal((sql.match(/LEFT JOIN "commerce"\."ShopBrand"/g) ?? []).length, 3);
  assert.equal((sql.match(/"shopify"\."ShopBrand"/g) ?? []).length, 0);
  assert.match(sql, /sb\."shopId" = s\."id"/);
  assert.match(sql, /Prisma\.sql/);
});
