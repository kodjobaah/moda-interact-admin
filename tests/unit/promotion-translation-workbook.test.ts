import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPromotionTranslationTemplate,
  parseCompletedPromotionTranslationPackage,
} from "../../src/lib/admin/promotion-translations.ts";
import {
  buildPromotionTranslationWorkbook,
  parsePromotionTranslationWorkbook,
} from "../../src/lib/admin/promotion-translation-workbook.ts";
import { TRANSLATION_WORKBOOK_LOCALES } from "../../src/lib/admin/translation-workbook-common.ts";

const expected = {
  campaignId: "campaign-1",
  campaignInternalName: "Spring offer",
  sourceMerchantTitle: "Save time",
  sourceMerchantDescription: "Recover more conversations.",
};

function completeTemplate() {
  const template = buildPromotionTranslationTemplate(expected);
  for (const { locale } of TRANSLATION_WORKBOOK_LOCALES) {
    template.translations[locale] = {
      merchantTitle:
        locale === "en" ? expected.sourceMerchantTitle : `Title ${locale}`,
      merchantDescription:
        locale === "en"
          ? expected.sourceMerchantDescription
          : `Description ${locale}`,
    };
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
    await buildPromotionTranslationWorkbook(completeTemplate()),
  );
  mutator(workbook);
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

test("builds the exact pre-populated 20-locale workbook contract", async () => {
  const workbook = await workbookModel(
    await buildPromotionTranslationWorkbook(
      buildPromotionTranslationTemplate(expected),
    ),
  );
  assert.deepEqual(
    workbook.worksheets.map((sheet) => sheet.name),
    ["Instructions", "Translations", "_meta"],
  );
  assert.equal(workbook.getWorksheet("_meta")?.state, "veryHidden");
  const translations = workbook.getWorksheet("Translations")!;
  assert.deepEqual(
    TRANSLATION_WORKBOOK_LOCALES.map(
      ({ locale }, index) => translations.getCell(`B${index + 2}`).value,
    ),
    TRANSLATION_WORKBOOK_LOCALES.map(({ locale }) => locale),
  );
  assert.equal(translations.getCell("C5").value, "Save time");
  assert.equal(translations.getCell("C2").value, "");
  assert.equal(translations.autoFilter, "A1:D21");
  assert.equal(
    workbook.getWorksheet("_meta")?.getCell("B3").value,
    expected.campaignId,
  );
});

test("round-trips complete translations and preserves existing valid values", async () => {
  const result = await parsePromotionTranslationWorkbook(
    await buildPromotionTranslationWorkbook(completeTemplate()),
    expected,
  );
  assert.equal(result.workbookValid, true);
  assert.equal(result.translationResult?.valid, true);
  assert.equal(result.translationResult?.completeCount, 20);
  const parsed = JSON.parse(result.canonicalRawJson!);
  assert.equal(parsed.translations.ja.merchantTitle, "Title ja");
});

test("rejects changed source, wrong campaign, and formulas without evaluating them", async () => {
  const stale = await bytesWith((workbook) => {
    workbook.getWorksheet("_meta")!.getCell("B6").value = "Changed source";
  });
  const staleResult = await parsePromotionTranslationWorkbook(stale, expected);
  assert.ok(
    staleResult.workbookIssues.some(
      ({ code }) => code === "ENGLISH_SOURCE_MISMATCH",
    ),
  );
  const wrong = await bytesWith((workbook) => {
    workbook.getWorksheet("_meta")!.getCell("B3").value = "other";
  });
  const wrongResult = await parsePromotionTranslationWorkbook(wrong, expected);
  assert.ok(
    wrongResult.workbookIssues.some(
      ({ code }) => code === "CAMPAIGN_ID_MISMATCH",
    ),
  );
  const formula = await bytesWith((workbook) => {
    workbook.getWorksheet("Translations")!.getCell("C5").value = {
      formula: '"not translation"',
    };
  });
  const formulaResult = await parsePromotionTranslationWorkbook(
    formula,
    expected,
  );
  assert.ok(
    formulaResult.workbookIssues.some(
      ({ code }) => code === "UNSUPPORTED_CELL_VALUE",
    ),
  );
});

test("rejects changed worksheet order and non-exact metadata rows", async () => {
  const wrongSheet = await bytesWith((workbook) => {
    workbook.getWorksheet("Instructions")!.name = "Guide";
  });
  const wrongSheetResult = await parsePromotionTranslationWorkbook(
    wrongSheet,
    expected,
  );
  assert.ok(
    wrongSheetResult.workbookIssues.some(
      ({ code }) => code === "UNEXPECTED_WORKSHEET",
    ),
  );
  const extraMetadata = await bytesWith((workbook) => {
    workbook.getWorksheet("_meta")!.addRow(["unexpected", "value"]);
  });
  const extraMetadataResult = await parsePromotionTranslationWorkbook(
    extraMetadata,
    expected,
  );
  assert.ok(
    extraMetadataResult.workbookIssues.some(
      ({ code }) => code === "WORKBOOK_VERSION_MISMATCH",
    ),
  );
});

test("incomplete canonical packages stay invalid until all 20 locales are complete", () => {
  const template = buildPromotionTranslationTemplate(expected);
  const result = parseCompletedPromotionTranslationPackage(
    JSON.stringify(template),
    expected,
  );
  assert.equal(result.valid, false);
  assert.equal(result.completeCount, 1);
  assert.ok(
    result.issues.some(
      ({ code, locale }) => code === "DESCRIPTION_EMPTY" && locale === "ja",
    ),
  );
});
