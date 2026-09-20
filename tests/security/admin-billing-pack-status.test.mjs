import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath) => readFile(path.join(repositoryRoot, relativePath), "utf8");

function enumValues(schema, enumName) {
  const match = schema.match(new RegExp(`enum\\s+${enumName}\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(match, `${enumName} must exist in the Prisma schema`);
  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[A-Z][A-Z0-9_]*$/.test(line));
}

test("every RecoveryCreditPurchaseStatus has an ICU label and filter support", async () => {
  const [schema, catalogueSource, packsSource] = await Promise.all([
    read("database/prisma/schema.prisma"),
    read("src/i18n/locales/en.json"),
    read("src/components/admin/billing-recovery-packs.tsx"),
  ]);
  const catalogue = JSON.parse(catalogueSource);
  const statuses = enumValues(schema, "RecoveryCreditPurchaseStatus");

  assert.deepEqual(statuses, ["REQUESTED", "ACTIVE", "COMPLETED", "WITHDRAWN", "REFUNDED"]);
  for (const status of statuses) {
    assert.equal(typeof catalogue[`billing.packStatus.${status}`], "string", status);
  }
  assert.match(packsSource, /Object\.values\(RecoveryCreditPurchaseStatus\)/);
  assert.match(packsSource, /adminBillingPackStatusLabel\(status\)/);
  assert.match(packsSource, /adminBillingPackStatusLabel\(purchase\.status\)/);
});

test("purchase-status rendering uses the bounded presenter rather than dynamic ICU lookups", async () => {
  const [i18nSource, drawersSource, tenantSource] = await Promise.all([
    read("src/i18n/index.ts"),
    read("src/components/admin/billing-drawers.tsx"),
    read("src/components/admin/tenant-billing.tsx"),
  ]);

  assert.match(i18nSource, /export function adminBillingPackStatusLabel/);
  assert.match(i18nSource, /Object\.hasOwn\(catalogue, key\)/);
  assert.match(drawersSource, /adminBillingPackStatusLabel\(purchase\.status\)/);
  assert.match(tenantSource, /adminBillingPackStatusLabel\(purchase\.status\)/);
  assert.doesNotMatch(`${drawersSource}\n${tenantSource}`, /adminI18n\.t\(`billing\.packStatus\.\$\{/);
});
