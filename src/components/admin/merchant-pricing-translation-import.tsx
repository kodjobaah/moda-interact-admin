"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildMerchantPricingTranslationTemplate,
  parseCompletedMerchantPricingTranslationPackage,
  type MerchantPricingTranslationParseResult,
} from "@/lib/admin/merchant-pricing-translations";
import type { MerchantPricingBuilderHighlight } from "@/lib/admin/merchant-pricing-builder-payload";

const MAX_TRANSLATION_BYTES = 262144;
const inputClass =
  "w-full rounded-md border border-gray-300 bg-white p-2 text-sm";

const ISSUE_SUMMARIES = [
  {
    codes: ["MISSING_HIGHLIGHT", "UNEXPECTED_HIGHLIGHT"],
    message:
      "The highlight structure does not match the downloaded template. Keep the highlight IDs from the template unchanged. Put the translated title and description inside each highlight ID instead of using translated titles as JSON keys.",
  },
  {
    codes: ["MISSING_LOCALE", "UNEXPECTED_LOCALE"],
    message:
      "The file does not contain the exact 20 supported locale codes from the template. Do not add, remove or rename locale codes.",
  },
  {
    codes: [
      "PLAN_HANDLE_MISMATCH",
      "PLAN_NAME_MISMATCH",
      "ENGLISH_SOURCE_MISMATCH",
      "HIGHLIGHT_ENGLISH_SOURCE_MISMATCH",
    ],
    message:
      "This translation file was created for different or older plan content. Download a fresh template for the current draft and apply the translations to that template.",
  },
  {
    codes: [
      "DESCRIPTION_EMPTY",
      "HIGHLIGHT_TITLE_EMPTY",
      "HIGHLIGHT_DESCRIPTION_EMPTY",
    ],
    message:
      "Some required translated text is empty. Every plan description and every highlight title and description must be completed in all 20 languages.",
  },
  {
    codes: ["UNSUPPORTED_SCHEMA_VERSION"],
    message:
      "This translation file uses an unsupported template version. Download a new template from this plan and try again.",
  },
] as const;

export function summarizeMerchantPricingTranslationIssues(
  issues: MerchantPricingTranslationParseResult["issues"],
): string[] {
  return ISSUE_SUMMARIES.filter(({ codes }) =>
    issues.some((issue) => new Set(codes).has(issue.code)),
  ).map(({ message }) => message);
}

export function MerchantPricingTranslationImport({
  planHandle,
  planName,
  englishDescription,
  highlights,
  initialRawJson,
  onChange,
}: {
  planHandle: string;
  planName: string;
  englishDescription: string;
  highlights: MerchantPricingBuilderHighlight[];
  initialRawJson?: string;
  onChange: (
    rawJson: string,
    result: MerchantPricingTranslationParseResult,
  ) => void;
}) {
  const [rawJson, setRawJson] = useState(initialRawJson ?? "");
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [editedAfterUpload, setEditedAfterUpload] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const result = useMemo(
    () =>
      rawJson
        ? parseCompletedMerchantPricingTranslationPackage(rawJson, {
            planHandle,
            planName,
            englishDescription,
            highlights,
          })
        : null,
    [englishDescription, highlights, planHandle, planName, rawJson],
  );

  useEffect(() => {
    if (!rawJson) return;
    onChange(rawJson, result!);
  }, [onChange, rawJson, result]);

  function updateRawJson(nextRawJson: string, edited = false) {
    setRawJson(nextRawJson);
    if (edited && selectedFileName) setEditedAfterUpload(true);
  }

  function downloadTemplate() {
    const template = buildMerchantPricingTranslationTemplate({
      planHandle,
      planName,
      englishDescription,
      highlights,
    });
    const blob = new Blob([JSON.stringify(template, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${planHandle}-translations.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function processSelectedTranslationFile(file: File): Promise<void> {
    if (file.size > MAX_TRANSLATION_BYTES) {
      setUploadError("The translation file is larger than 256 KiB.");
      return;
    }
    if (
      !file.name.toLowerCase().endsWith(".json") &&
      file.type !== "application/json"
    ) {
      setUploadError("Choose a JSON file ending in .json.");
      return;
    }
    try {
      const nextRawJson = await file.text();
      setUploadError(null);
      setSelectedFileName(file.name);
      setEditedAfterUpload(false);
      updateRawJson(nextRawJson);
    } catch {
      setUploadError(
        "The translation file could not be read. Try the file again or paste the JSON instead.",
      );
    }
  }

  return (
    <section className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-gray-900">Translations and review</h3>
        <button
          type="button"
          onClick={downloadTemplate}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700"
        >
          Download translation JSON template
        </button>
      </div>
      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
        <h4 className="font-semibold">How to complete the translation file</h4>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Download the JSON template generated for this plan.</li>
          <li>Translate only the text values inside description, title and description fields.</li>
          <li>Do not rename locale codes, highlight IDs, field names or JSON structure.</li>
          <li>Keep every highlight ID exactly as it appears in the downloaded template.</li>
          <li>Upload the completed JSON file or paste its contents below.</li>
        </ol>
        <pre className="mt-3 overflow-x-auto rounded bg-white p-2 text-xs">{`"f2e0f43f-614f-4333-ba0c-23aa08a51d3b": {
  "title": "Translated title",
  "description": "Translated description"
}`}</pre>
      </div>
      <label className="block text-sm font-medium text-gray-700">
        Paste completed translation JSON
        <textarea
          className={`${inputClass} mt-1 font-mono text-xs`}
          rows={12}
          value={rawJson}
          onChange={(event) => updateRawJson(event.target.value, true)}
        />
      </label>
      <div
        className={`rounded-md border-2 border-dashed p-4 text-center text-sm ${isDragging ? "border-[var(--brand-700)] bg-[var(--brand-50)]" : "border-gray-300 bg-white"}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (event.dataTransfer.files.length !== 1) {
            setUploadError("Upload one JSON file at a time.");
            return;
          }
          void processSelectedTranslationFile(event.dataTransfer.files[0]);
        }}
      >
        <p className="font-semibold">Upload completed translation file</p>
        <p className="mt-1">Drop your completed JSON file here</p>
        <p>or</p>
        <button
          type="button"
          className="mt-1 rounded-md border border-gray-400 bg-white px-3 py-2 font-semibold"
          onClick={() => fileInputRef.current?.click()}
        >
          Choose JSON file
        </button>
        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept=".json,application/json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void processSelectedTranslationFile(file);
            event.target.value = "";
          }}
        />
        <p className="mt-2 text-xs text-gray-600">JSON only · maximum size 256 KiB</p>
      </div>
      {uploadError ? <p className="text-sm font-semibold text-red-700">{uploadError}</p> : null}
      {selectedFileName ? (
        <p className="text-sm text-gray-700">
          {editedAfterUpload
            ? `Source file: ${selectedFileName} · contents edited after upload`
            : `Selected file: ${selectedFileName}`}
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
          {result.valid && selectedFileName ? `✓ ${selectedFileName}` : null}
          {result.valid
            ? "20 / 20 languages complete"
            : `${result.completeCount} / 20 languages complete`}
          <div>{result.valid ? "Translation file is ready to save." : "Translation file needs attention."}</div>
        </div>
      ) : null}
      {!result?.valid && result?.issues.length ? (
        <ul className="list-disc pl-5 text-sm text-red-700">
          {summarizeMerchantPricingTranslationIssues(result.issues).map(
            (summary) => <li key={summary}>{summary}</li>,
          )}
        </ul>
      ) : null}
      {result?.issues.length ? (
        <details className="text-xs text-red-700">
          <summary>Show technical details ({result.issues.length} issues)</summary>
          <ul className="mt-2 max-h-48 list-disc overflow-y-auto pl-5">
            {result.issues.map((entry, index) => (
              <li key={`${entry.path}-${index}`}>
                {entry.code}: {entry.path} {entry.message}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
