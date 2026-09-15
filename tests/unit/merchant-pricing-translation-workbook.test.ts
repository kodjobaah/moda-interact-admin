import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMerchantPricingTranslationTemplate,
  type MerchantPricingTranslationPackage,
} from "../../src/lib/admin/merchant-pricing-translations.ts";
import {
  buildMerchantPricingTranslationWorkbook,
  MERCHANT_PRICING_TRANSLATION_WORKBOOK_MIME,
  parseMerchantPricingTranslationWorkbook,
} from "../../src/lib/admin/merchant-pricing-translation-workbook.ts";
import {
  MERCHANT_PRICING_LOCALES,
  MERCHANT_PRICING_LOCALE_LABELS,
} from "../../src/lib/admin/merchant-pricing-locales.ts";

const highlight = {
  contentKey: "550e8400-e29b-41d4-a716-446655440000",
  title: "Included capacity",
  description: "100 monthly recovery conversations.",
};
const secondHighlight = {
  contentKey: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  title: "Priority support",
  description: "Faster help when you need it.",
};
const expected = {
  planHandle: "starter",
  planName: "Starter",
  englishDescription: "English description",
  highlights: [highlight, secondHighlight],
};

function completeTemplate(): MerchantPricingTranslationPackage {
  const template = buildMerchantPricingTranslationTemplate(expected);
  for (const locale of MERCHANT_PRICING_LOCALES) {
    template.translations[locale].description =
      locale === "en" ? expected.englishDescription : `Description ${locale}`;
    for (const item of expected.highlights) {
      template.translations[locale].highlights[item.contentKey] = {
        title: locale === "en" ? item.title : `${item.title} ${locale}`,
        description:
          locale === "en" ? item.description : `${item.description} ${locale}`,
      };
    }
  }
  return template;
}

async function workbookModel(bytes: ArrayBuffer) {
  const module = await import("exceljs");
  const ExcelJS = module.default ?? module;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as never);
  return workbook;
}

async function bytesWith(
  mutator: (workbook: Awaited<ReturnType<typeof workbookModel>>) => void,
) {
  const workbook = await workbookModel(
    await buildMerchantPricingTranslationWorkbook(
      completeTemplate(),
      expected.highlights,
    ),
  );
  mutator(workbook);
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

test("generates the exact workbook sheets, metadata, rows, formatting and source values", async () => {
  const template = buildMerchantPricingTranslationTemplate(expected);
  const bytes = await buildMerchantPricingTranslationWorkbook(
    template,
    expected.highlights,
  );
  const workbook = await workbookModel(bytes);
  assert.deepEqual(
    workbook.worksheets.map((sheet) => sheet.name),
    ["Instructions", "Translations", "_meta"],
  );
  assert.equal(workbook.getWorksheet("_meta")?.state, "veryHidden");
  assert.equal(
    workbook.getWorksheet("Instructions")?.getCell("A1").value,
    "Moda Interact merchant-pricing translation workbook",
  );
  const translations = workbook.getWorksheet("Translations")!;
  assert.deepEqual(
    MERCHANT_PRICING_LOCALES.map(
      (_, index) => translations.getCell(`B${index + 2}`).value,
    ),
    [...MERCHANT_PRICING_LOCALES],
  );
  assert.deepEqual(
    MERCHANT_PRICING_LOCALES.map(
      (locale) =>
        translations.getCell(`A${MERCHANT_PRICING_LOCALES.indexOf(locale) + 2}`)
          .value,
    ),
    MERCHANT_PRICING_LOCALES.map(
      (locale) => MERCHANT_PRICING_LOCALE_LABELS[locale],
    ),
  );
  assert.equal(translations.getCell("C5").value, expected.englishDescription);
  assert.equal(translations.getCell("C2").value, "");
  assert.equal(translations.getCell("D5").value, highlight.title);
  assert.equal(translations.getCell("E5").value, highlight.description);
  assert.equal(
    (translations.getCell("C2").fill as { fgColor?: { argb?: string } }).fgColor
      ?.argb,
    "FFFFF2CC",
  );
  assert.equal((translations.views[0] as { xSplit?: number }).xSplit, 2);
  assert.equal((translations.views[0] as { ySplit?: number }).ySplit, 1);
  assert.equal(translations.autoFilter, "A1:G21");
  assert.equal(workbook.getWorksheet("_meta")?.getCell("B2").value, 1);
  assert.equal(workbook.getWorksheet("_meta")?.getCell("B3").value, 2);
  assert.equal(
    workbook.getWorksheet("_meta")?.getCell("B7").value,
    JSON.stringify(MERCHANT_PRICING_LOCALES),
  );
  assert.equal(
    MERCHANT_PRICING_TRANSLATION_WORKBOOK_MIME,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
});

test("round-trips XLSX through canonical schema v2 and the existing parser", async () => {
  const result = await parseMerchantPricingTranslationWorkbook(
    await buildMerchantPricingTranslationWorkbook(
      completeTemplate(),
      expected.highlights,
    ),
    expected,
  );
  assert.equal(result.workbookValid, true);
  assert.equal(result.workbookIssues.length, 0);
  assert.equal(result.translationResult?.valid, true);
  assert.equal(result.translationResult?.completeCount, 20);
  assert.equal(JSON.parse(result.canonicalRawJson!)._meta.schemaVersion, 2);
});

test("preserves canonical retention behavior for unchanged, changed and reordered highlights", async () => {
  const previous = completeTemplate();
  const retained = buildMerchantPricingTranslationTemplate({
    ...expected,
    highlights: [secondHighlight, highlight],
    previous: {
      englishDescription: expected.englishDescription,
      highlights: expected.highlights,
      translations: MERCHANT_PRICING_LOCALES.map((locale) => ({
        locale,
        merchantDescription: previous.translations[locale].description,
        highlights: expected.highlights.map((item) => ({
          contentKey: item.contentKey,
          ...previous.translations[locale].highlights[item.contentKey],
        })),
      })),
    },
  });
  assert.equal(retained.translations.fr.description, "Description fr");
  assert.equal(
    retained.translations.fr.highlights[highlight.contentKey].title,
    "Included capacity fr",
  );
  assert.equal(
    retained.translations.fr.highlights[secondHighlight.contentKey].title,
    "Priority support fr",
  );
  const changed = buildMerchantPricingTranslationTemplate({
    ...expected,
    englishDescription: "Changed description",
    highlights: [{ ...highlight, title: "Changed capacity" }, secondHighlight],
    previous: {
      englishDescription: expected.englishDescription,
      highlights: expected.highlights,
      translations: MERCHANT_PRICING_LOCALES.map((locale) => ({
        locale,
        merchantDescription: previous.translations[locale].description,
        highlights: expected.highlights.map((item) => ({
          contentKey: item.contentKey,
          ...previous.translations[locale].highlights[item.contentKey],
        })),
      })),
    },
  });
  assert.equal(changed.translations.fr.description, "");
  assert.equal(
    changed.translations.fr.highlights[highlight.contentKey].title,
    "",
  );
  assert.equal(
    changed.translations.fr.highlights[secondHighlight.contentKey].title,
    "Priority support fr",
  );
});

test("rejects stale metadata, locale/header changes, and highlight identity changes", async () => {
  const stale = await bytesWith((workbook) => {
    workbook.getWorksheet("_meta")!.getCell("B4").value = "different";
  });
  const staleResult = await parseMerchantPricingTranslationWorkbook(
    stale,
    expected,
  );
  assert.ok(
    staleResult.workbookIssues.some(
      ({ code }) => code === "PLAN_HANDLE_MISMATCH",
    ),
  );

  const altered = await bytesWith((workbook) => {
    workbook.getWorksheet("Translations")!.getCell("A2").value = "Not Czech";
    workbook.getWorksheet("Translations")!.getCell("B2").value = "xx";
    workbook.getWorksheet("Translations")!.getCell("A1").value = "Wrong";
    workbook.getWorksheet("_meta")!.getCell("B7").value = JSON.stringify([
      "xx",
    ]);
  });
  const alteredResult = await parseMerchantPricingTranslationWorkbook(
    altered,
    expected,
  );
  assert.ok(
    alteredResult.workbookIssues.some(
      ({ code }) => code === "LANGUAGE_LABEL_MISMATCH",
    ),
  );
  assert.ok(
    alteredResult.workbookIssues.some(
      ({ code }) => code === "LOCALE_ROW_MISMATCH",
    ),
  );
  assert.ok(
    alteredResult.workbookIssues.some(({ code }) => code === "HEADER_MISMATCH"),
  );
  assert.ok(
    alteredResult.workbookIssues.some(
      ({ code }) => code === "LOCALE_ORDER_MISMATCH",
    ),
  );

  const identity = await bytesWith((workbook) => {
    workbook.getWorksheet("_meta")!.getCell("B12").value =
      "not-the-content-key";
  });
  const identityResult = await parseMerchantPricingTranslationWorkbook(
    identity,
    expected,
  );
  assert.ok(
    identityResult.workbookIssues.some(
      ({ code }) => code === "HIGHLIGHT_SET_MISMATCH",
    ),
  );
});

test("reports missing canonical translations and rejects formulas without evaluating them", async () => {
  const incomplete = buildMerchantPricingTranslationTemplate(expected);
  const incompleteResult = await parseMerchantPricingTranslationWorkbook(
    await buildMerchantPricingTranslationWorkbook(
      incomplete,
      expected.highlights,
    ),
    expected,
  );
  assert.equal(incompleteResult.workbookValid, true);
  assert.equal(incompleteResult.translationResult?.valid, false);
  assert.equal(incompleteResult.translationResult?.completeCount, 1);
  assert.ok(
    incompleteResult.translationResult?.issues.some(
      ({ code, locale }) => code === "DESCRIPTION_EMPTY" && locale === "ja",
    ),
  );

  const formula = await bytesWith((workbook) => {
    workbook.getWorksheet("Translations")!.getCell("C5").value = {
      formula: '"not translation"',
    };
  });
  const formulaResult = await parseMerchantPricingTranslationWorkbook(
    formula,
    expected,
  );
  assert.equal(formulaResult.workbookValid, false);
  assert.ok(
    formulaResult.workbookIssues.some(
      ({ code }) => code === "UNSUPPORTED_CELL_VALUE",
    ),
  );
});

test("invalid XLSX bytes are rejected without producing canonical state", async () => {
  const result = await parseMerchantPricingTranslationWorkbook(
    new TextEncoder().encode("not xlsx").buffer,
    expected,
  );
  assert.equal(result.workbookValid, false);
  assert.equal(result.canonicalRawJson, null);
  assert.equal(result.translationResult, null);
  assert.ok(result.workbookIssues.some(({ code }) => code === "INVALID_XLSX"));
});
