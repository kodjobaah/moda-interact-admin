import assert from "node:assert/strict";
import { test } from "node:test";
import { checkWrapperEligibility } from "../../src/lib/admin/whatsapp-templates/wrappers/eligibility.ts";
import { renderWrapperPreview } from "../../src/lib/admin/whatsapp-templates/wrappers/preview.ts";
import { SHOP_BRAND_VARIABLES } from "../../src/lib/admin/whatsapp-templates/authoring/registry.ts";
import { compileTemplateAst } from "../../src/lib/admin/whatsapp-templates/authoring/compiler.ts";
import { templateHash } from "../../src/lib/admin/whatsapp-templates/authoring/identifiers.ts";
import { wrapperRow, brandedWrapper } from "../fixtures/arch047-wrapper-fixture.ts";

test("all 20 reviewed prepared locale projections, eight brand keys and immutable hashes are required", () => {
  const row = wrapperRow();
  const original = JSON.stringify(row);
  const check = checkWrapperEligibility(row, "SHARED");
  assert.equal(check.eligible, true);
  if (!check.eligible) return;
  assert.equal(Object.keys(check.projections).length, 20);
  for (const prepared of Object.values(check.projections)) {
    assert.equal(prepared.body.filter((t) => t.kind === "responseSlot").length, 1);
    const tokens = [...prepared.header, ...prepared.footer, ...prepared.conditionals.flatMap((item) => item.tokens)];
    assert.deepEqual(new Set(tokens.filter((item) => item.kind === "variable" && item.name.startsWith("shopBrand.")).map((item) =>
      item.kind === "variable" ? item.name : "")), new Set(SHOP_BRAND_VARIABLES));
  }
  assert.equal(JSON.stringify(row), original, "Eligibility is read-only");
  assert.ok(!JSON.stringify(check.projections).includes("Example Brand"), "Example merchant values never enter prepared records");
});

test("unsafe source, missing review, duplicates, missing slots and corrupted content are rejected", () => {
  const changes: Array<(row: ReturnType<typeof wrapperRow>) => void> = [
    (row) => { row.kind = "META_RECOVERY"; },
    (row) => { row.audience = "HUMAN"; },
    (row) => { row.status = "RETIRED"; },
    (row) => { row.sourceHash = "0".repeat(64); },
    (row) => { row.locales.splice(10, 1); },
    (row) => { row.locales[9].languageTag = "en"; },
    (row) => { row.locales[3].status = "PENDING"; },
    (row) => { row.locales[4].reviewedAt = null; },
    (row) => { row.locales[3].contentHash = "f".repeat(64); },
    (row) => { row.locales[3].localeAst = null; },
    (row) => { (row.locales[2].localeAst as {prepared:{responseSlot:string}}).prepared.responseSlot = "other"; },
    (row) => { (row.locales[3].localeAst as {prepared:{body:unknown[]}}).prepared.body = []; },
    (row) => { (row.locales[3].localeAst as {authoring:{body:unknown[]}}).authoring.body = []; },
  ];
  for (const [i, change] of changes.entries()) {
    const row = wrapperRow(); change(row);
    assert.equal(checkWrapperEligibility(row, "SHARED").eligible, false, `fixture ${i}`);
  }
  assert.equal(checkWrapperEligibility(wrapperRow(), "AI").eligible, false, "No audience hijack");
});

test("altered translated protected markers, unknown ShopBrand key and forbidden checkout URL placement fail closed", () => {
  const altered = wrapperRow();
  const french = altered.locales.find((item) => item.languageTag === "fr")!;
  const record = french.localeAst as { authoring: ReturnType<typeof brandedWrapper>; prepared: unknown };
  record.authoring.footer = [{ type: "variable", name: "shopBrand.logoUrl" }];
  record.prepared = compileTemplateAst(record.authoring);
  french.contentHash = templateHash(record.prepared);
  assert.match((checkWrapperEligibility(altered, "SHARED") as {reason:string}).reason, /protected variable identities/);

  const invalid = wrapperRow();
  const locale = invalid.locales.find((item) => item.languageTag === "en")!;
  (locale.localeAst as { authoring: { header: unknown[] } }).authoring.header = [
    { type: "variable", name: "shopBrand.unknownKey" },
  ];
  assert.equal(checkWrapperEligibility(invalid, "SHARED").eligible, false);

  const misplaced = wrapperRow();
  (misplaced.locales[0].localeAst as { authoring: { header: unknown[] } }).authoring.header = [
    { type: "variable", name: "checkout.url" },
  ];
  assert.equal(checkWrapperEligibility(misplaced, "SHARED").eligible, false);
});

test("fictional preview shows all sections; unavailable ShopBrand values are labelled rather than invented", () => {
  const valid = checkWrapperEligibility(wrapperRow(), "SHARED");
  assert.equal(valid.eligible, true);
  if (!valid.eligible) return;
  const prepared = valid.projections.en;
  const available = renderWrapperPreview(prepared, { response: "Example test response", checkoutAvailable: true });
  assert.equal(available.body, "Example test response");
  assert.match(available.header, /Example Brand/);
  assert.match(available.conditional ?? "", /https:\/\/www\.example\.com\/checkout\/demo/);
  assert.equal(available.exampleOnly, true);
  assert.equal(available.disclosures.filter((entry) => entry.name.startsWith("shopBrand.")).length, 8);
  const noCheckout = renderWrapperPreview(prepared, { response: "Do not change", checkoutAvailable: false });
  assert.equal(noCheckout.conditional, null);
  assert.equal(noCheckout.disclosures.length, available.disclosures.length - 3);

  const shop = renderWrapperPreview(prepared, { response: "Seller response", checkoutAvailable: true,
    context: { kind: "SHOP_SCOPED", shopBrand: { "shopBrand.brandName": "Real Tenant" }, checkoutUrl: null },
  });
  assert.match(shop.header, /Real Tenant/);
  assert.equal(shop.conditional, null, "Missing trusted checkout URL suppresses the entire conditional");
  assert.match(shop.header, /\[Unavailable: shopBrand.logoUrl\]/);
  assert.doesNotMatch(shop.header, /Example Brand logo/);
  assert.ok(shop.disclosures.some((entry) => entry.availability.startsWith("Missing optional")));
});
