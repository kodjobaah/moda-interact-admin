"use client";

import { useState } from "react";
import { importPromotionTranslationsAction } from "@/app/actions/promotions";
import {
  buildPromotionTranslationWorkbook,
  parsePromotionTranslationWorkbook,
  PROMOTION_TRANSLATION_WORKBOOK_MAX_BYTES,
  PROMOTION_TRANSLATION_WORKBOOK_MIME,
  type PromotionTranslationWorkbookIssue,
} from "@/lib/admin/promotion-translation-workbook";
import {
  TRANSLATION_WORKBOOK_LOCALES,
  type TranslationWorkbookLocale,
} from "@/lib/admin/translation-workbook-common";
import type {
  PromotionTranslationPackage,
  PromotionTranslationParseResult,
} from "@/lib/admin/promotion-translations";

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

export function PromotionTranslationWorkbook({
  campaignId,
  template,
  completeCount,
}: {
  campaignId: string;
  template: PromotionTranslationPackage;
  completeCount: number;
}) {
  const [result, setResult] = useState<PromotionTranslationParseResult | null>(
    null,
  );
  const [issues, setIssues] = useState<PromotionTranslationWorkbookIssue[]>([]);
  const [json, setJson] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function processFile(file: File) {
    setError(null);
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
      const parsed = await parsePromotionTranslationWorkbook(
        await file.arrayBuffer(),
        {
          campaignId: template._meta.campaignId,
          campaignInternalName: template._meta.campaignInternalName,
          sourceMerchantTitle: template._meta.sourceMerchantTitle,
          sourceMerchantDescription: template._meta.sourceMerchantDescription,
        },
      );
      setFileName(file.name);
      setIssues(parsed.workbookIssues);
      setResult(parsed.translationResult);
      setJson(parsed.canonicalRawJson ?? "");
    } catch {
      setError(
        "The translation spreadsheet could not be read. Download a fresh spreadsheet and try again.",
      );
      setJson("");
    }
  }

  async function download() {
    const bytes = await buildPromotionTranslationWorkbook(template);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([bytes], { type: PROMOTION_TRANSLATION_WORKBOOK_MIME }),
    );
    link.download = filename(template._meta.campaignInternalName);
    link.click();
  }

  const missing =
    result && !result.valid
      ? missingTranslations(result)
      : new Map<string, string[]>();
  return (
    <section className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-4">
      <div>
        <h3 className="font-semibold text-gray-900">Translations</h3>
        <p className="text-sm text-gray-600">
          {result?.valid
            ? "20 / 20 languages complete"
            : `${result?.completeCount ?? completeCount} / 20 languages complete`}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void download()}
        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700"
      >
        Download pre-populated translation spreadsheet
      </button>
      <div
        className={`rounded-md border bg-white p-4 text-center text-sm ${dragging ? "border-[var(--brand-700)]" : "border-gray-300"}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) void processFile(file);
        }}
      >
        <p className="font-semibold">
          Upload completed translation spreadsheet
        </p>
        <p className="mt-1">Drop your completed .xlsx spreadsheet here</p>
        <p>or</p>
        <label className="mt-1 inline-block cursor-pointer rounded-md border border-gray-400 px-3 py-2 font-semibold">
          Choose spreadsheet
          <input
            className="sr-only"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void processFile(file);
              event.target.value = "";
            }}
          />
        </label>
        <p className="mt-2 text-xs text-gray-600">
          .xlsx only · maximum size 2 MiB
        </p>
      </div>
      {error ? (
        <p className="text-sm font-semibold text-red-700">{error}</p>
      ) : null}
      {fileName ? (
        <p className="text-sm text-gray-700">Selected file: {fileName}</p>
      ) : null}
      {result && !result.valid ? (
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
      {result?.valid ? (
        <form action={importPromotionTranslationsAction}>
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="translationJson" value={json} />
          <button
            type="submit"
            className="rounded-md bg-[var(--brand-700)] px-3 py-2 text-sm font-semibold text-white"
          >
            Save all 20 translations
          </button>
        </form>
      ) : null}
    </section>
  );
}
