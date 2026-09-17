"use client";

import { useEffect, useRef, useState } from "react";
import { TranslationWorkbookDropzone } from "@/components/admin/translation-workbook-dropzone";
import {
  buildPromotionTranslationWorkbook,
  parsePromotionTranslationWorkbook,
  PROMOTION_TRANSLATION_WORKBOOK_MAX_BYTES,
  PROMOTION_TRANSLATION_WORKBOOK_MIME,
  type PromotionTranslationWorkbookIssue,
} from "@/lib/admin/promotions/translation-workbook";
import {
  TRANSLATION_WORKBOOK_LOCALES,
  type TranslationWorkbookLocale,
} from "@/lib/admin/translation-workbook-common";
import type {
  PromotionTranslationPackage,
  PromotionTranslationParseResult,
} from "@/lib/admin/promotions/translations";

function filename(name: string) {
  return `${name.replace(/[^A-Za-z0-9._-]/g, "-") || "promotion"}-translations.xlsx`;
}

function missingTranslations(result: PromotionTranslationParseResult) {
  const grouped = new Map<string, string[]>();
  for (const entry of result.issues) {
    if (
      !entry.locale ||
      !["TITLE_EMPTY", "DESCRIPTION_EMPTY"].includes(entry.code)
    )
      continue;
    const locale = TRANSLATION_WORKBOOK_LOCALES.find(
      ({ locale: value }) => value === entry.locale,
    ) as TranslationWorkbookLocale;
    const label = `${locale.languageLabel} (${locale.locale})`;
    const values = grouped.get(label) ?? [];
    values.push(
      entry.code === "TITLE_EMPTY" ? "Merchant title" : "Merchant description",
    );
    grouped.set(label, values);
  }
  return grouped;
}

function expectedFromTemplate(template: PromotionTranslationPackage) {
  return {
    campaignId: template._meta.campaignId,
    campaignInternalName: template._meta.campaignInternalName,
    sourceMerchantTitle: template._meta.sourceMerchantTitle,
    sourceMerchantDescription: template._meta.sourceMerchantDescription,
  };
}

export function PromotionTranslationWorkbook({
  template,
  completeCount,
  translationsRetained,
  disabled = false,
  onChange,
}: {
  template: PromotionTranslationPackage;
  completeCount: number;
  translationsRetained: boolean;
  disabled?: boolean;
  onChange: (
    rawJson: string,
    result: PromotionTranslationParseResult | null,
  ) => void;
}) {
  const [result, setResult] = useState<PromotionTranslationParseResult | null>(
    null,
  );
  const [issues, setIssues] = useState<PromotionTranslationWorkbookIssue[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadedBytes, setUploadedBytes] = useState<ArrayBuffer | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!uploadedBytes) return;
    let cancelled = false;
    void parsePromotionTranslationWorkbook(
      uploadedBytes,
      expectedFromTemplate(template),
    ).then((parsed) => {
      if (cancelled) return;
      setIssues(parsed.workbookIssues);
      setResult(parsed.translationResult);
      if (parsed.canonicalRawJson && parsed.translationResult) {
        onChangeRef.current(parsed.canonicalRawJson, parsed.translationResult);
      } else {
        onChangeRef.current("", null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    template._meta.campaignId,
    template._meta.campaignInternalName,
    template._meta.sourceMerchantTitle,
    template._meta.sourceMerchantDescription,
    uploadedBytes,
  ]);

  async function processFile(file: File) {
    setError(null);
    if (disabled) return;
    if (file.size > PROMOTION_TRANSLATION_WORKBOOK_MAX_BYTES) {
      setError("The translation spreadsheet is larger than 2 MiB.");
      return;
    }
    if (
      !file.name.toLowerCase().endsWith(".xlsx") &&
      file.type !== PROMOTION_TRANSLATION_WORKBOOK_MIME
    ) {
      setError("Choose an Excel workbook ending in .xlsx.");
      return;
    }
    try {
      const bytes = await file.arrayBuffer();
      const parsed = await parsePromotionTranslationWorkbook(
        bytes,
        expectedFromTemplate(template),
      );
      setFileName(file.name);
      setIssues(parsed.workbookIssues);
      setResult(parsed.translationResult);
      setUploadedBytes(parsed.workbookValid ? bytes : null);
      if (parsed.canonicalRawJson && parsed.translationResult) {
        onChange(parsed.canonicalRawJson, parsed.translationResult);
      } else {
        onChange("", null);
      }
    } catch {
      setError(
        "The translation spreadsheet could not be read. Download a fresh spreadsheet and try again.",
      );
      setUploadedBytes(null);
      setIssues([]);
      setResult(null);
      onChange("", null);
    }
  }

  async function download() {
    if (disabled) return;
    const bytes = await buildPromotionTranslationWorkbook(template);
    const link = document.createElement("a");
    const url = URL.createObjectURL(
      new Blob([bytes], { type: PROMOTION_TRANSLATION_WORKBOOK_MIME }),
    );
    link.href = url;
    link.download = filename(template._meta.campaignInternalName);
    link.click();
    URL.revokeObjectURL(url);
  }

  function clearWorkbook() {
    setFileName(null);
    setUploadedBytes(null);
    setIssues([]);
    setResult(null);
    setError(null);
    onChange("", null);
  }

  const missing =
    result && !result.valid
      ? missingTranslations(result)
      : new Map<string, string[]>();
  const stale =
    result?.issues.some(({ code }) =>
      [
        "CAMPAIGN_ID_MISMATCH",
        "CAMPAIGN_NAME_MISMATCH",
        "ENGLISH_SOURCE_MISMATCH",
      ].includes(code),
    ) ?? false;

  return (
    <section className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-4">
      <div>
        <h3 className="font-semibold text-gray-900">Translations</h3>
        <p className="text-sm text-gray-600">
          {result?.valid || translationsRetained
            ? "20 / 20 languages complete"
            : `${result?.completeCount ?? completeCount} / 20 languages complete`}
        </p>
      </div>
      <p className="whitespace-pre-line text-sm text-gray-700">
        Download a pre-populated spreadsheet for this campaign.{"\n\n"}It
        already contains all 20 supported languages, the English merchant title
        and description, and any existing translations that are still valid.
        {"\n\n"}Fill only the blank translation cells, save the workbook as
        .xlsx, then upload it below. The campaign and all 20 translations are
        saved together by the campaign button.
      </p>
      {disabled ? (
        <p className="text-sm font-semibold text-amber-700">
          Enter the internal campaign name, English merchant title and English
          merchant description before preparing translations.
        </p>
      ) : null}
      <button
        type="button"
        disabled={disabled}
        onClick={() => void download()}
        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Download pre-populated translation spreadsheet
      </button>
      <TranslationWorkbookDropzone
        disabled={disabled}
        onFile={processFile}
        onSelectionError={setError}
      />
      {error ? (
        <p className="text-sm font-semibold text-red-700">{error}</p>
      ) : null}
      {fileName ? (
        <p className="text-sm text-gray-700">Selected file: {fileName}</p>
      ) : null}
      {translationsRetained && !fileName ? (
        <p className="text-sm font-semibold text-green-700">
          Existing 20 / 20 translations will be saved with this campaign.
        </p>
      ) : null}
      {result?.valid ? (
        <p className="text-sm font-semibold text-green-700">
          Translation spreadsheet is ready to save with this campaign.
        </p>
      ) : null}
      {stale ? (
        <p className="text-sm font-semibold text-red-700">
          This spreadsheet was created for different or older campaign content.
          Download a fresh spreadsheet for the current campaign fields and copy
          the translations into it.
        </p>
      ) : null}
      {result && !result.valid && missing.size ? (
        <div className="text-sm text-red-700">
          <p className="font-semibold">Missing translations</p>
          {Array.from(missing, ([language, values]) => (
            <div key={language} className="mt-2">
              <p className="font-semibold">{language}</p>
              <ul className="list-disc pl-5">
                {values.map((value) => (
                  <li key={value}>{value}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
      {issues.length || result?.issues.length ? (
        <details className="text-xs text-red-700">
          <summary>Show technical details</summary>
          <ul className="mt-2 max-h-48 list-disc overflow-y-auto pl-5">
            {issues.map((entry, index) => (
              <li key={`workbook-${index}`}>
                {entry.code}: {entry.message}
              </li>
            ))}
            {result?.issues.map((entry, index) => (
              <li key={`package-${index}`}>
                {entry.code}: {entry.message}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {fileName && result ? (
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
