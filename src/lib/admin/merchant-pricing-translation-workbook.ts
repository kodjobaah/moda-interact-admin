import {
  loadTranslationWorkbookExcelJS,
  TRANSLATION_WORKBOOK_LOCALES,
  TRANSLATION_WORKBOOK_MAX_BYTES,
  TRANSLATION_WORKBOOK_MIME,
} from "./translation-workbook-common.ts";
import {
  MERCHANT_PRICING_LOCALES,
  type MerchantPricingLocale,
} from "./merchant-pricing-locales.ts";
import {
  parseCompletedMerchantPricingTranslationPackage,
  type MerchantPricingTranslationExpected,
  type MerchantPricingTranslationHighlightSource,
  type MerchantPricingTranslationPackage,
  type MerchantPricingTranslationParseResult,
} from "./merchant-pricing-translations.ts";

export const MERCHANT_PRICING_TRANSLATION_WORKBOOK_SCHEMA_VERSION = 1;
export const MERCHANT_PRICING_TRANSLATION_WORKBOOK_MAX_BYTES =
  TRANSLATION_WORKBOOK_MAX_BYTES;
export const MERCHANT_PRICING_TRANSLATION_WORKBOOK_MIME =
  TRANSLATION_WORKBOOK_MIME;

export type MerchantPricingTranslationWorkbookIssue = {
  code: string;
  message: string;
  sheet?: string;
  cell?: string;
};

export type MerchantPricingTranslationWorkbookExpected =
  MerchantPricingTranslationExpected;

const SHEET_NAMES = ["Instructions", "Translations", "_meta"] as const;
const sourceFill = "FFE8F0FE";
const missingFill = "FFFFF2CC";

function columnName(number: number): string {
  let value = number;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function highlightColumn(index: number): {
  title: number;
  description: number;
} {
  return { title: 4 + index * 2, description: 5 + index * 2 };
}

function addIssue(
  issues: MerchantPricingTranslationWorkbookIssue[],
  code: string,
  message: string,
  sheet?: string,
  cell?: string,
) {
  issues.push({
    code,
    message,
    ...(sheet ? { sheet } : {}),
    ...(cell ? { cell } : {}),
  });
}

function cellText(
  value: unknown,
  issues: MerchantPricingTranslationWorkbookIssue[],
  sheet: string,
  cell: string,
): string | null {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  addIssue(
    issues,
    "UNSUPPORTED_CELL_VALUE",
    "Translation cells must contain text or be blank.",
    sheet,
    cell,
  );
  return null;
}

function cellValue(
  worksheet: { getCell(address: string): { value: unknown } },
  address: string,
) {
  return worksheet.getCell(address).value;
}

export async function buildMerchantPricingTranslationWorkbook(
  canonicalTemplate: MerchantPricingTranslationPackage,
  orderedHighlights: MerchantPricingTranslationHighlightSource[],
): Promise<ArrayBuffer> {
  const ExcelJS = await loadTranslationWorkbookExcelJS();
  const workbook = new ExcelJS.Workbook();
  const instructions = workbook.addWorksheet("Instructions");
  const translations = workbook.addWorksheet("Translations");
  const meta = workbook.addWorksheet("_meta");
  meta.state = "veryHidden";

  instructions.getCell("A1").value =
    "Moda Interact merchant-pricing translation workbook";
  instructions.getCell("A3").value = "Plan name";
  instructions.getCell("B3").value = canonicalTemplate._meta.planName;
  instructions.getCell("A4").value = "Shopify plan handle";
  instructions.getCell("B4").value = canonicalTemplate._meta.planHandle;
  instructions.getCell("A6").value = "What to do";
  instructions.getCell("A7").value = "1. Open the Translations sheet.";
  instructions.getCell("A8").value =
    "2. Fill only the missing translated text cells.";
  instructions.getCell("A9").value =
    "3. Do not change Language, Locale, column headings, worksheet names or the English source row.";
  instructions.getCell("A10").value =
    "4. Existing translations are already populated where Moda knows they are still valid.";
  instructions.getCell("A11").value =
    "5. Save the workbook as .xlsx and upload it back to Moda Interact.";
  instructions.getCell("A13").value =
    "Yellow cells are translations that still need to be supplied.";
  instructions.getCell("A14").value =
    "The English row is the source content and must not be translated or changed in this workbook.";

  const headers = ["Language", "Locale", "Plan description"];
  orderedHighlights.forEach((highlight, index) => {
    headers.push(
      `Highlight ${index + 1} title`,
      `Highlight ${index + 1} description`,
    );
  });
  translations.addRow(headers);
  TRANSLATION_WORKBOOK_LOCALES.forEach(({ locale, languageLabel }) => {
    const translation = canonicalTemplate.translations[locale];
    const row = [languageLabel, locale, translation.description];
    orderedHighlights.forEach((highlight) => {
      const value = translation.highlights[highlight.contentKey];
      row.push(value?.title ?? "", value?.description ?? "");
    });
    translations.addRow(row);
  });
  translations.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];
  translations.autoFilter = `A1:${columnName(headers.length)}${TRANSLATION_WORKBOOK_LOCALES.length + 1}`;
  translations.getColumn(1).width = 24;
  translations.getColumn(2).width = 14;
  translations.getColumn(3).width = 60;
  orderedHighlights.forEach((_, index) => {
    translations.getColumn(highlightColumn(index).title).width = 34;
    translations.getColumn(highlightColumn(index).description).width = 60;
  });
  translations.getRow(1).font = { bold: true };
  translations.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const isEnglish = row.getCell(2).value === "en";
    row.eachCell((cell, columnNumber) => {
      if (columnNumber < 3) return;
      cell.alignment = { wrapText: true, vertical: "top" };
      if (isEnglish)
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: sourceFill },
        };
      else if (cell.value === "")
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: missingFill },
        };
    });
  });

  [
    ["workbookKind", "moda-interact-merchant-pricing-translations"],
    [
      "workbookSchemaVersion",
      MERCHANT_PRICING_TRANSLATION_WORKBOOK_SCHEMA_VERSION,
    ],
    ["canonicalTranslationSchemaVersion", 2],
    ["planHandle", canonicalTemplate._meta.planHandle],
    ["planName", canonicalTemplate._meta.planName],
    ["sourceLocale", "en"],
    ["localeOrder", JSON.stringify(MERCHANT_PRICING_LOCALES)],
    ["highlightCount", orderedHighlights.length],
  ].forEach((row) => meta.addRow(row));
  meta.addRow([]);
  meta.addRow([]);
  meta.addRow(["position", "contentKey", "titleColumn", "descriptionColumn"]);
  orderedHighlights.forEach((highlight, index) => {
    const columns = highlightColumn(index);
    meta.addRow([
      index,
      highlight.contentKey,
      columns.title,
      columns.description,
    ]);
  });

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function parseMerchantPricingTranslationWorkbook(
  workbookBytes: ArrayBuffer,
  expected: MerchantPricingTranslationWorkbookExpected,
): Promise<{
  workbookValid: boolean;
  workbookIssues: MerchantPricingTranslationWorkbookIssue[];
  canonicalRawJson: string | null;
  translationResult: MerchantPricingTranslationParseResult | null;
}> {
  const issues: MerchantPricingTranslationWorkbookIssue[] = [];
  if (
    workbookBytes.byteLength > MERCHANT_PRICING_TRANSLATION_WORKBOOK_MAX_BYTES
  ) {
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
      new Uint8Array(workbookBytes) as unknown as Parameters<
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
  const actualNames = workbook.worksheets.map((worksheet) => worksheet.name);
  if (JSON.stringify(actualNames) !== JSON.stringify(SHEET_NAMES)) {
    addIssue(
      issues,
      "UNEXPECTED_WORKSHEET",
      "Worksheets must be ordered Instructions, Translations, _meta.",
    );
  }
  if (actualNames.length !== SHEET_NAMES.length)
    addIssue(
      issues,
      "UNEXPECTED_WORKSHEET",
      "The workbook must contain exactly Instructions, Translations and _meta sheets.",
    );
  SHEET_NAMES.forEach((name) => {
    if (!actualNames.includes(name))
      addIssue(
        issues,
        "MISSING_WORKSHEET",
        `Missing worksheet: ${name}.`,
        name,
      );
  });
  actualNames
    .filter(
      (name) => !SHEET_NAMES.includes(name as (typeof SHEET_NAMES)[number]),
    )
    .forEach((name) =>
      addIssue(
        issues,
        "UNEXPECTED_WORKSHEET",
        `Unexpected worksheet: ${name}.`,
        name,
      ),
    );
  const meta = workbook.getWorksheet("_meta");
  const translations = workbook.getWorksheet("Translations");
  if (!meta || !translations)
    return {
      workbookValid: false,
      workbookIssues: issues,
      canonicalRawJson: null,
      translationResult: null,
    };

  const metadata = new Map<string, unknown>();
  for (let row = 1; row <= 8; row += 1)
    metadata.set(
      String(cellValue(meta, `A${row}`)),
      cellValue(meta, `B${row}`),
    );
  if (
    metadata.get("workbookKind") !==
    "moda-interact-merchant-pricing-translations"
  )
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
  if (metadata.get("canonicalTranslationSchemaVersion") !== 2)
    addIssue(
      issues,
      "CANONICAL_SCHEMA_VERSION_MISMATCH",
      "Canonical translation schema version is invalid.",
      "_meta",
      "B3",
    );
  if (metadata.get("planHandle") !== expected.planHandle.trim())
    addIssue(
      issues,
      "PLAN_HANDLE_MISMATCH",
      "Workbook plan handle does not match the current draft.",
      "_meta",
      "B4",
    );
  if (metadata.get("planName") !== expected.planName.trim())
    addIssue(
      issues,
      "PLAN_NAME_MISMATCH",
      "Workbook plan name does not match the current draft.",
      "_meta",
      "B5",
    );
  if (metadata.get("sourceLocale") !== "en")
    addIssue(
      issues,
      "SOURCE_LOCALE_MISMATCH",
      "Workbook source locale must be en.",
      "_meta",
      "B6",
    );
  let localeOrder: unknown;
  try {
    localeOrder = JSON.parse(String(metadata.get("localeOrder")));
  } catch {
    localeOrder = null;
  }
  if (JSON.stringify(localeOrder) !== JSON.stringify(MERCHANT_PRICING_LOCALES))
    addIssue(
      issues,
      "LOCALE_ORDER_MISMATCH",
      "Workbook locale order does not match the canonical locale order.",
      "_meta",
      "B7",
    );
  if (metadata.get("highlightCount") !== expected.highlights?.length)
    addIssue(
      issues,
      "HIGHLIGHT_SET_MISMATCH",
      "Workbook highlight count does not match the current draft.",
      "_meta",
      "B8",
    );

  const expectedHighlights = expected.highlights ?? [];
  if (meta.rowCount !== 11 + expectedHighlights.length)
    addIssue(
      issues,
      "HIGHLIGHT_SET_MISMATCH",
      "Workbook highlight metadata contains extra or missing rows.",
      "_meta",
    );
  const metaHeader = [
    "position",
    "contentKey",
    "titleColumn",
    "descriptionColumn",
  ];
  metaHeader.forEach((value, index) => {
    if (cellValue(meta, `${columnName(index + 1)}11`) !== value)
      addIssue(
        issues,
        "HIGHLIGHT_SET_MISMATCH",
        "Highlight metadata header is invalid.",
        "_meta",
        `${columnName(index + 1)}11`,
      );
  });
  expectedHighlights.forEach((highlight, index) => {
    const row = 12 + index;
    const columns = highlightColumn(index);
    if (
      cellValue(meta, `A${row}`) !== index ||
      cellValue(meta, `B${row}`) !== highlight.contentKey ||
      cellValue(meta, `C${row}`) !== columns.title ||
      cellValue(meta, `D${row}`) !== columns.description
    )
      addIssue(
        issues,
        "HIGHLIGHT_SET_MISMATCH",
        "Workbook highlight metadata does not match the current draft.",
        "_meta",
        `B${row}`,
      );
  });
  if (Number(metadata.get("highlightCount")) !== expectedHighlights.length)
    addIssue(
      issues,
      "HIGHLIGHT_SET_MISMATCH",
      "Workbook highlight metadata contains a different number of highlights.",
      "_meta",
      "B8",
    );

  const headers = ["Language", "Locale", "Plan description"];
  expectedHighlights.forEach((_, index) =>
    headers.push(
      `Highlight ${index + 1} title`,
      `Highlight ${index + 1} description`,
    ),
  );
  if (translations.columnCount !== headers.length)
    addIssue(
      issues,
      "HEADER_MISMATCH",
      "Translations contains extra or missing columns.",
      "Translations",
    );
  headers.forEach((header, index) => {
    const address = `${columnName(index + 1)}1`;
    if (cellValue(translations, address) !== header)
      addIssue(
        issues,
        "HEADER_MISMATCH",
        `Unexpected translation header: ${address}.`,
        "Translations",
        address,
      );
  });
  if (translations.rowCount !== TRANSLATION_WORKBOOK_LOCALES.length + 1)
    addIssue(
      issues,
      "LOCALE_ROW_MISMATCH",
      "Translations must contain exactly 20 locale rows.",
      "Translations",
    );
  const canonical = {
    _meta: {
      schemaVersion: 2 as const,
      planHandle: expected.planHandle.trim(),
      planName: expected.planName.trim(),
      sourceLocale: "en" as const,
    },
    translations: {} as MerchantPricingTranslationPackage["translations"],
  };
  TRANSLATION_WORKBOOK_LOCALES.forEach(({ locale, languageLabel }, index) => {
    const row = index + 2;
    if (cellValue(translations, `A${row}`) !== languageLabel)
      addIssue(
        issues,
        "LANGUAGE_LABEL_MISMATCH",
        `Language label does not match ${locale}.`,
        "Translations",
        `A${row}`,
      );
    if (cellValue(translations, `B${row}`) !== locale)
      addIssue(
        issues,
        "LOCALE_ROW_MISMATCH",
        `Locale does not match ${locale}.`,
        "Translations",
        `B${row}`,
      );
    const description = cellText(
      cellValue(translations, `C${row}`),
      issues,
      "Translations",
      `C${row}`,
    );
    const highlightValues: Record<
      string,
      { title: string; description: string }
    > = {};
    expectedHighlights.forEach((highlight, highlightIndex) => {
      const columns = highlightColumn(highlightIndex);
      const title = cellText(
        cellValue(translations, `${columnName(columns.title)}${row}`),
        issues,
        "Translations",
        `${columnName(columns.title)}${row}`,
      );
      const highlightDescription = cellText(
        cellValue(translations, `${columnName(columns.description)}${row}`),
        issues,
        "Translations",
        `${columnName(columns.description)}${row}`,
      );
      highlightValues[highlight.contentKey] = {
        title: title ?? "",
        description: highlightDescription ?? "",
      };
    });
    canonical.translations[locale as MerchantPricingLocale] = {
      description: description ?? "",
      highlights: highlightValues,
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
  const translationResult = parseCompletedMerchantPricingTranslationPackage(
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
