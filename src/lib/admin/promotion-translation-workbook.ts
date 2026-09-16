import {
  loadTranslationWorkbookExcelJS,
  TRANSLATION_WORKBOOK_LOCALES,
  TRANSLATION_WORKBOOK_MAX_BYTES,
  TRANSLATION_WORKBOOK_MIME,
} from "./translation-workbook-common.ts";
import {
  buildPromotionTranslationTemplate,
  parseCompletedPromotionTranslationPackage,
  type PromotionTranslationExpected,
  type PromotionTranslationPackage,
  type PromotionTranslationParseResult,
} from "./promotion-translations.ts";

export const PROMOTION_TRANSLATION_WORKBOOK_SCHEMA_VERSION = 1;
export const PROMOTION_TRANSLATION_WORKBOOK_MAX_BYTES =
  TRANSLATION_WORKBOOK_MAX_BYTES;
export const PROMOTION_TRANSLATION_WORKBOOK_MIME = TRANSLATION_WORKBOOK_MIME;
export const PROMOTION_TRANSLATION_WORKBOOK_SHEETS = [
  "Instructions",
  "Translations",
  "_meta",
] as const;
export type PromotionTranslationWorkbookIssue = {
  code: string;
  message: string;
  sheet?: string;
  cell?: string;
};

const addIssue = (
  issues: PromotionTranslationWorkbookIssue[],
  code: string,
  message: string,
  sheet?: string,
  cell?: string,
) => {
  issues.push({
    code,
    message,
    ...(sheet ? { sheet } : {}),
    ...(cell ? { cell } : {}),
  });
};
const valueAt = (
  sheet: { getCell(address: string): { value: unknown } },
  address: string,
) => sheet.getCell(address).value;
const columnName = (number: number) => {
  let result = "";
  for (let value = number; value > 0; value = Math.floor((value - 1) / 26))
    result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
  return result;
};
const cellText = (
  value: unknown,
  issues: PromotionTranslationWorkbookIssue[],
  cell: string,
): string | null => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  addIssue(
    issues,
    "UNSUPPORTED_CELL_VALUE",
    "Translation cells must contain text or be blank.",
    "Translations",
    cell,
  );
  return null;
};

export async function buildPromotionTranslationWorkbook(
  template: PromotionTranslationPackage,
): Promise<ArrayBuffer> {
  const ExcelJS = await loadTranslationWorkbookExcelJS();
  const workbook = new ExcelJS.Workbook();
  const instructions = workbook.addWorksheet("Instructions");
  const translations = workbook.addWorksheet("Translations");
  const meta = workbook.addWorksheet("_meta");
  meta.state = "veryHidden";
  instructions.getCell("A1").value =
    "Moda Interact promotion translation workbook";
  instructions.getCell("A3").value = "Internal campaign name";
  instructions.getCell("B3").value = template._meta.campaignInternalName;
  instructions.getCell("A5").value =
    "This spreadsheet is already populated with all 20 supported languages.";
  instructions.getCell("A6").value =
    "Fill only blank Merchant title / Merchant description cells.";
  instructions.getCell("A7").value =
    "Do not change Language, Locale, worksheet names or the English source row.";
  instructions.getCell("A8").value =
    "Save as .xlsx and upload it back to Moda Interact.";
  instructions.getCell("A9").value =
    "The internal campaign name is for administrator context only and is not translated or merchant-facing.";
  translations.addRow([
    "Language",
    "Locale",
    "Merchant title",
    "Merchant description",
  ]);
  for (const { locale, languageLabel } of TRANSLATION_WORKBOOK_LOCALES) {
    const value = template.translations[locale];
    translations.addRow([
      languageLabel,
      locale,
      value.merchantTitle,
      value.merchantDescription,
    ]);
  }
  translations.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];
  translations.autoFilter = "A1:D21";
  translations.getColumn(1).width = 24;
  translations.getColumn(2).width = 14;
  translations.getColumn(3).width = 36;
  translations.getColumn(4).width = 72;
  translations.getRow(1).font = { bold: true };
  translations.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const english = row.getCell(2).value === "en";
    row.eachCell((cell, columnNumber) => {
      if (columnNumber < 3) return;
      cell.alignment = { wrapText: true, vertical: "top" };
      if (english)
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE8F0FE" },
        };
      else if (cell.value === "")
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFF2CC" },
        };
    });
  });
  [
    ["workbookKind", "moda-interact-promotion-translations"],
    ["workbookSchemaVersion", PROMOTION_TRANSLATION_WORKBOOK_SCHEMA_VERSION],
    ["campaignId", template._meta.campaignId],
    ["campaignInternalName", template._meta.campaignInternalName],
    ["sourceLocale", "en"],
    ["sourceMerchantTitle", template._meta.sourceMerchantTitle],
    ["sourceMerchantDescription", template._meta.sourceMerchantDescription],
    [
      "localeOrder",
      JSON.stringify(TRANSLATION_WORKBOOK_LOCALES.map(({ locale }) => locale)),
    ],
  ].forEach((row) => meta.addRow(row));
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function parsePromotionTranslationWorkbook(
  bytes: ArrayBuffer,
  expected: PromotionTranslationExpected,
): Promise<{
  workbookValid: boolean;
  workbookIssues: PromotionTranslationWorkbookIssue[];
  canonicalRawJson: string | null;
  translationResult: PromotionTranslationParseResult | null;
}> {
  const issues: PromotionTranslationWorkbookIssue[] = [];
  if (bytes.byteLength > PROMOTION_TRANSLATION_WORKBOOK_MAX_BYTES) {
    addIssue(issues, "INVALID_XLSX", "The workbook exceeds the 2 MiB limit.");
    return {
      workbookValid: false,
      workbookIssues: issues,
      canonicalRawJson: null,
      translationResult: null,
    };
  }
  const ExcelJS = await loadTranslationWorkbookExcelJS();
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(
      new Uint8Array(bytes) as unknown as Parameters<
        typeof workbook.xlsx.load
      >[0],
    );
  } catch {
    addIssue(
      issues,
      "INVALID_XLSX",
      "The uploaded file is not a readable XLSX workbook.",
    );
    return {
      workbookValid: false,
      workbookIssues: issues,
      canonicalRawJson: null,
      translationResult: null,
    };
  }
  const actualNames = workbook.worksheets.map((sheet) => sheet.name);
  if (
    JSON.stringify(actualNames) !==
    JSON.stringify(PROMOTION_TRANSLATION_WORKBOOK_SHEETS)
  )
    addIssue(
      issues,
      "UNEXPECTED_WORKSHEET",
      "Worksheets must be ordered Instructions, Translations, _meta.",
    );
  for (const name of PROMOTION_TRANSLATION_WORKBOOK_SHEETS)
    if (!actualNames.includes(name))
      addIssue(
        issues,
        "MISSING_WORKSHEET",
        `Missing worksheet: ${name}.`,
        name,
      );
  if (
    issues.some(
      ({ code }) =>
        code === "UNEXPECTED_WORKSHEET" || code === "MISSING_WORKSHEET",
    )
  )
    return {
      workbookValid: false,
      workbookIssues: issues,
      canonicalRawJson: null,
      translationResult: null,
    };
  const meta = workbook.getWorksheet("_meta");
  const translations = workbook.getWorksheet("Translations");
  if (!meta || !translations)
    return {
      workbookValid: false,
      workbookIssues: issues,
      canonicalRawJson: null,
      translationResult: null,
    };
  const metadataRows = [
    ["workbookKind", "moda-interact-promotion-translations"],
    ["workbookSchemaVersion", 1],
    ["campaignId", expected.campaignId.trim()],
    ["campaignInternalName", expected.campaignInternalName.trim()],
    ["sourceLocale", "en"],
    ["sourceMerchantTitle", expected.sourceMerchantTitle.trim()],
    ["sourceMerchantDescription", expected.sourceMerchantDescription.trim()],
    [
      "localeOrder",
      JSON.stringify(TRANSLATION_WORKBOOK_LOCALES.map(({ locale }) => locale)),
    ],
  ] as const;
  if (meta.rowCount !== metadataRows.length)
    addIssue(
      issues,
      "WORKBOOK_VERSION_MISMATCH",
      "The _meta sheet must contain exactly eight ordered key/value rows.",
      "_meta",
    );
  metadataRows.forEach(([key], index) => {
    if (valueAt(meta, `A${index + 1}`) !== key)
      addIssue(
        issues,
        "WORKBOOK_VERSION_MISMATCH",
        `Unexpected metadata key at A${index + 1}.`,
        "_meta",
        `A${index + 1}`,
      );
  });
  if (issues.some(({ code }) => code === "WORKBOOK_VERSION_MISMATCH"))
    return {
      workbookValid: false,
      workbookIssues: issues,
      canonicalRawJson: null,
      translationResult: null,
    };
  const metadata = new Map<string, unknown>();
  metadataRows.forEach(([key], index) =>
    metadata.set(key, valueAt(meta, `B${index + 1}`)),
  );
  if (metadata.get("workbookKind") !== "moda-interact-promotion-translations")
    addIssue(
      issues,
      "WORKBOOK_VERSION_MISMATCH",
      "Workbook kind is invalid.",
      "_meta",
      "A1",
    );
  if (metadata.get("workbookSchemaVersion") !== 1)
    addIssue(
      issues,
      "WORKBOOK_VERSION_MISMATCH",
      "Workbook schema version is invalid.",
      "_meta",
      "B2",
    );
  if (metadata.get("campaignId") !== expected.campaignId.trim())
    addIssue(
      issues,
      "CAMPAIGN_ID_MISMATCH",
      "Workbook campaign id does not match the current draft.",
      "_meta",
      "B3",
    );
  if (
    metadata.get("campaignInternalName") !==
    expected.campaignInternalName.trim()
  )
    addIssue(
      issues,
      "CAMPAIGN_NAME_MISMATCH",
      "Workbook campaign name does not match the current draft.",
      "_meta",
      "B4",
    );
  if (metadata.get("sourceLocale") !== "en")
    addIssue(
      issues,
      "ENGLISH_SOURCE_MISMATCH",
      "Workbook source locale must be en.",
      "_meta",
      "B5",
    );
  if (
    metadata.get("sourceMerchantTitle") !==
      expected.sourceMerchantTitle.trim() ||
    metadata.get("sourceMerchantDescription") !==
      expected.sourceMerchantDescription.trim()
  )
    addIssue(
      issues,
      "ENGLISH_SOURCE_MISMATCH",
      "Workbook English source does not match the current draft.",
      "_meta",
    );
  let localeOrder: unknown;
  try {
    localeOrder = JSON.parse(String(metadata.get("localeOrder")));
  } catch {
    localeOrder = null;
  }
  const locales = TRANSLATION_WORKBOOK_LOCALES.map(({ locale }) => locale);
  if (JSON.stringify(localeOrder) !== JSON.stringify(locales))
    addIssue(
      issues,
      "LOCALE_ORDER_MISMATCH",
      "Workbook locale order does not match the canonical locale order.",
      "_meta",
      "B8",
    );
  const headers = [
    "Language",
    "Locale",
    "Merchant title",
    "Merchant description",
  ];
  if (translations.columnCount !== headers.length)
    addIssue(
      issues,
      "HEADER_MISMATCH",
      "Translations contains extra or missing columns.",
      "Translations",
    );
  headers.forEach((header, index) => {
    if (valueAt(translations, `${columnName(index + 1)}1`) !== header)
      addIssue(
        issues,
        "HEADER_MISMATCH",
        `Unexpected translation header: ${columnName(index + 1)}1.`,
        "Translations",
        `${columnName(index + 1)}1`,
      );
  });
  if (translations.rowCount !== 21)
    addIssue(
      issues,
      "LOCALE_ROW_MISMATCH",
      "Translations must contain exactly 20 locale rows.",
      "Translations",
    );
  const canonical = buildPromotionTranslationTemplate(expected);
  TRANSLATION_WORKBOOK_LOCALES.forEach(({ locale, languageLabel }, index) => {
    const row = index + 2;
    if (valueAt(translations, `A${row}`) !== languageLabel)
      addIssue(
        issues,
        "LANGUAGE_LABEL_MISMATCH",
        `Language label does not match ${locale}.`,
        "Translations",
        `A${row}`,
      );
    if (valueAt(translations, `B${row}`) !== locale)
      addIssue(
        issues,
        "LOCALE_ROW_MISMATCH",
        `Locale does not match ${locale}.`,
        "Translations",
        `B${row}`,
      );
    const title = cellText(valueAt(translations, `C${row}`), issues, `C${row}`);
    const description = cellText(
      valueAt(translations, `D${row}`),
      issues,
      `D${row}`,
    );
    canonical.translations[locale] = {
      merchantTitle: title ?? "",
      merchantDescription: description ?? "",
    };
  });
  if (issues.length)
    return {
      workbookValid: false,
      workbookIssues: issues,
      canonicalRawJson: null,
      translationResult: null,
    };
  const canonicalRawJson = JSON.stringify(canonical);
  const translationResult = parseCompletedPromotionTranslationPackage(
    canonicalRawJson,
    expected,
  );
  return {
    workbookValid: true,
    workbookIssues: [],
    canonicalRawJson,
    translationResult,
  };
}
