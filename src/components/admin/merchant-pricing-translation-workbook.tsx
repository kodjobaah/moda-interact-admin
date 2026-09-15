"use client";

import { useEffect, useRef, useState } from "react";
import type { MerchantPricingBuilderHighlight } from "@/lib/admin/merchant-pricing-builder-payload";
import {
  buildMerchantPricingTranslationWorkbook,
  MERCHANT_PRICING_TRANSLATION_WORKBOOK_MAX_BYTES,
  MERCHANT_PRICING_TRANSLATION_WORKBOOK_MIME,
  parseMerchantPricingTranslationWorkbook,
  type MerchantPricingTranslationWorkbookIssue,
} from "@/lib/admin/merchant-pricing-translation-workbook";
import {
  MERCHANT_PRICING_LOCALE_LABELS,
  type MerchantPricingLocale,
} from "@/lib/admin/merchant-pricing-locales";
import type {
  MerchantPricingTranslationPackage,
  MerchantPricingTranslationParseResult,
} from "@/lib/admin/merchant-pricing-translations";

function filename(handle: string): string {
  const sanitized = handle.replace(/[^A-Za-z0-9._-]/g, "-");
  return `${sanitized || "merchant-plan"}-translations.xlsx`;
}

function missingTranslations(
  result: MerchantPricingTranslationParseResult,
  highlights: MerchantPricingBuilderHighlight[],
) {
  const grouped = new Map<string, string[]>();
  result.issues.forEach((issue) => {
    if (
      !issue.locale ||
      ![
        "DESCRIPTION_EMPTY",
        "HIGHLIGHT_TITLE_EMPTY",
        "HIGHLIGHT_DESCRIPTION_EMPTY",
      ].includes(issue.code)
    )
      return;
    const locale = issue.locale as MerchantPricingLocale;
    const label = `${MERCHANT_PRICING_LOCALE_LABELS[locale]} (${locale})`;
    const values = grouped.get(label) ?? [];
    if (issue.code === "DESCRIPTION_EMPTY") values.push("Plan description");
    else {
      const match = issue.path.match(
        /highlights\.([^.]*)\.(title|description)$/,
      );
      const highlight = match
        ? highlights.find((entry) => entry.contentKey === match[1])
        : undefined;
      const position = match
        ? highlights.findIndex((entry) => entry.contentKey === match[1]) + 1
        : 0;
      values.push(
        `Highlight ${position} ${match?.[2] ?? "text"}${highlight ? ` — ${highlight.title}` : ""}`,
      );
    }
    grouped.set(label, values);
  });
  return grouped;
}

export function MerchantPricingTranslationWorkbook({
  planHandle,
  canonicalTemplate,
  highlights,
  onChange,
  translationsRetained,
}: {
  planHandle: string;
  canonicalTemplate: MerchantPricingTranslationPackage;
  highlights: MerchantPricingBuilderHighlight[];
  translationsRetained: boolean;
  onChange: (
    rawJson: string,
    result: MerchantPricingTranslationParseResult | null,
  ) => void;
}) {
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [workbookIssues, setWorkbookIssues] = useState<
    MerchantPricingTranslationWorkbookIssue[]
  >([]);
  const [result, setResult] =
    useState<MerchantPricingTranslationParseResult | null>(null);
  const [uploadedBytes, setUploadedBytes] = useState<ArrayBuffer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!uploadedBytes) return;
    let cancelled = false;
    void parseMerchantPricingTranslationWorkbook(uploadedBytes, {
      planHandle: canonicalTemplate._meta.planHandle,
      planName: canonicalTemplate._meta.planName,
      englishDescription: canonicalTemplate.translations.en.description,
      highlights,
    }).then((parsed) => {
      if (cancelled) return;
      setWorkbookIssues(parsed.workbookIssues);
      setResult(parsed.translationResult);
      if (parsed.canonicalRawJson && parsed.translationResult)
        onChangeRef.current(parsed.canonicalRawJson, parsed.translationResult);
      else onChangeRef.current("", null);
    });
    return () => {
      cancelled = true;
    };
  }, [
    canonicalTemplate._meta.planHandle,
    canonicalTemplate._meta.planName,
    canonicalTemplate.translations.en.description,
    highlights,
    uploadedBytes,
  ]);

  async function downloadWorkbook() {
    const bytes = await buildMerchantPricingTranslationWorkbook(
      canonicalTemplate,
      highlights,
    );
    const blob = new Blob([bytes], {
      type: MERCHANT_PRICING_TRANSLATION_WORKBOOK_MIME,
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename(planHandle);
    link.click();
    URL.revokeObjectURL(url);
  }

  async function processSelectedTranslationWorkbook(file: File) {
    if (file.size > MERCHANT_PRICING_TRANSLATION_WORKBOOK_MAX_BYTES) {
      setUploadError("The translation spreadsheet is larger than 2 MiB.");
      return;
    }
    if (
      !file.name.toLowerCase().endsWith(".xlsx") &&
      file.type !== MERCHANT_PRICING_TRANSLATION_WORKBOOK_MIME
    ) {
      setUploadError("Choose an Excel workbook ending in .xlsx.");
      return;
    }
    try {
      const bytes = await file.arrayBuffer();
      const parsed = await parseMerchantPricingTranslationWorkbook(bytes, {
        planHandle: canonicalTemplate._meta.planHandle,
        planName: canonicalTemplate._meta.planName,
        englishDescription: canonicalTemplate.translations.en.description,
        highlights,
      });
      setSelectedFileName(file.name);
      setUploadedBytes(bytes);
      setUploadError(
        parsed.workbookIssues.some(({ code }) => code === "INVALID_XLSX")
          ? "The translation spreadsheet could not be read. Download a fresh spreadsheet and try again."
          : null,
      );
      setWorkbookIssues(parsed.workbookIssues);
      setResult(parsed.translationResult);
      if (parsed.canonicalRawJson && parsed.translationResult)
        onChange(parsed.canonicalRawJson, parsed.translationResult);
    } catch {
      setUploadError(
        "The translation spreadsheet could not be read. Download a fresh spreadsheet and try again.",
      );
    }
  }

  function clearWorkbook() {
    setSelectedFileName(null);
    setUploadedBytes(null);
    setWorkbookIssues([]);
    setResult(null);
    setUploadError(null);
    if (!translationsRetained) onChange("", null);
    else onChange("", null);
  }

  const stale =
    workbookIssues.some(({ code }) =>
      [
        "PLAN_HANDLE_MISMATCH",
        "PLAN_NAME_MISMATCH",
        "HIGHLIGHT_SET_MISMATCH",
      ].includes(code),
    ) ||
    result?.issues.some(({ code }) =>
      ["ENGLISH_SOURCE_MISMATCH", "HIGHLIGHT_ENGLISH_SOURCE_MISMATCH"].includes(
        code,
      ),
    );
  const missing =
    result && !result.valid
      ? missingTranslations(result, highlights)
      : new Map<string, string[]>();

  return (
    <section className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-4">
      <h3 className="font-semibold text-gray-900">Translations</h3>
      <p className="whitespace-pre-line text-sm text-gray-700">
        Download a pre-populated spreadsheet for this plan.{"\n\n"}It already
        contains all 20 supported languages, the English source content, every
        current plan highlight, and any existing translations that are still
        valid.{"\n\n"}Fill only the blank translation cells, save the workbook
        as .xlsx, then upload it below.
      </p>
      <button
        type="button"
        onClick={() => void downloadWorkbook()}
        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700"
      >
        Download pre-populated translation spreadsheet
      </button>
      <div
        className="rounded-md border border-gray-300 bg-white p-4 text-center text-sm"
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (event.dataTransfer.files.length !== 1) {
            setUploadError("Upload one spreadsheet at a time.");
            return;
          }
          void processSelectedTranslationWorkbook(event.dataTransfer.files[0]);
        }}
      >
        <p className="font-semibold">
          Upload completed translation spreadsheet
        </p>
        <p className="mt-1">Drop your completed .xlsx spreadsheet here</p>
        <p>or</p>
        <button
          type="button"
          className={`mt-1 rounded-md border px-3 py-2 font-semibold ${isDragging ? "border-[var(--brand-700)]" : "border-gray-400"}`}
          onClick={() => fileInputRef.current?.click()}
        >
          Choose spreadsheet
        </button>
        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void processSelectedTranslationWorkbook(file);
            event.target.value = "";
          }}
        />
        <p className="mt-2 text-xs text-gray-600">
          .xlsx only · maximum size 2 MiB
        </p>
      </div>
      {uploadError ? (
        <p className="text-sm font-semibold text-red-700">{uploadError}</p>
      ) : null}
      {selectedFileName ? (
        <p className="text-sm text-gray-700">
          Selected file: {selectedFileName}
        </p>
      ) : null}
      {result ? (
        <div
          className={
            result.valid
              ? "text-sm font-semibold text-green-700"
              : "text-sm text-red-700"
          }
        >
          <div>
            {result.valid
              ? "20 / 20 languages complete"
              : `${result.completeCount} / 20 languages complete`}
          </div>
          <div>
            {result.valid
              ? "Translation spreadsheet is ready to save."
              : "Translation spreadsheet needs attention."}
          </div>
        </div>
      ) : null}
      {stale ? (
        <p className="text-sm font-semibold text-red-700">
          This spreadsheet was created for different or older plan content.
          Download a fresh translation spreadsheet for the current draft and
          copy the required translations into it.
        </p>
      ) : null}
      {missing.size ? (
        <div className="text-sm text-red-700">
          <p className="font-semibold">Missing translations</p>
          {Array.from(missing, ([language, entries]) => (
            <div key={language} className="mt-2">
              <p className="font-semibold">{language}</p>
              <ul className="list-disc pl-5">
                {entries.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
      {workbookIssues.length || result?.issues.length ? (
        <details className="text-xs text-red-700">
          <summary>Show technical details</summary>
          <ul className="mt-2 max-h-48 list-disc overflow-y-auto pl-5">
            {workbookIssues.map((issue, index) => (
              <li key={`workbook-${index}`}>
                {issue.code}:{" "}
                {issue.sheet
                  ? `${issue.sheet}${issue.cell ? `!${issue.cell}` : ""}`
                  : ""}{" "}
                {issue.message}
              </li>
            ))}
            {result?.issues.map((issue, index) => (
              <li key={`canonical-${index}`}>
                {issue.code}: {issue.path} {issue.message}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {selectedFileName && result ? (
        <button
          type="button"
          onClick={clearWorkbook}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold"
        >
          Clear uploaded spreadsheet
        </button>
      ) : null}
    </section>
  );
}
