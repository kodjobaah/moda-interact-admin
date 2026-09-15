"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildMerchantPricingTranslationTemplate,
  parseCompletedMerchantPricingTranslationPackage,
  type MerchantPricingTranslationParseResult,
} from "@/lib/admin/merchant-pricing-translations";

const MAX_TRANSLATION_BYTES = 262144;
const inputClass =
  "w-full rounded-md border border-gray-300 bg-white p-2 text-sm";

export function MerchantPricingTranslationImport({
  planHandle,
  planName,
  englishDescription,
  initialRawJson,
  onChange,
}: {
  planHandle: string;
  planName: string;
  englishDescription: string;
  initialRawJson?: string;
  onChange: (
    rawJson: string,
    result: MerchantPricingTranslationParseResult,
  ) => void;
}) {
  const [rawJson, setRawJson] = useState(initialRawJson ?? "");
  const result = useMemo(
    () =>
      rawJson
        ? parseCompletedMerchantPricingTranslationPackage(rawJson, {
            planHandle,
            planName,
            englishDescription,
          })
        : null,
    [englishDescription, planHandle, planName, rawJson],
  );

  useEffect(() => {
    if (!rawJson) return;
    onChange(rawJson, result!);
  }, [onChange, rawJson, result]);

  function updateRawJson(nextRawJson: string) {
    setRawJson(nextRawJson);
  }

  function downloadTemplate() {
    const template = buildMerchantPricingTranslationTemplate({
      planHandle,
      planName,
      englishDescription,
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

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_TRANSLATION_BYTES) {
      updateRawJson('{"error":"Translation package exceeds 256 KiB."}');
      return;
    }
    if (
      !file.name.toLowerCase().endsWith(".json") &&
      file.type !== "application/json"
    ) {
      updateRawJson('{"error":"Translation package must be a JSON file."}');
      return;
    }
    updateRawJson(await file.text());
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
      <label className="block text-sm font-medium text-gray-700">
        Paste completed translation JSON
        <textarea
          className={`${inputClass} mt-1 font-mono text-xs`}
          rows={12}
          value={rawJson}
          onChange={(event) => updateRawJson(event.target.value)}
        />
      </label>
      <label className="block text-sm font-medium text-gray-700">
        Upload JSON file
        <input
          className="mt-1 block text-sm"
          type="file"
          accept=".json,application/json"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
      </label>
      {result ? (
        <div
          className={
            result.valid
              ? "text-sm font-semibold text-green-700"
              : "text-sm text-red-700"
          }
        >
          {result.completeCount}/20 complete
          {!result.valid
            ? ` + ${result.issues.length} structural or locale issue(s)`
            : ""}
        </div>
      ) : null}
      {result?.issues.length ? (
        <ul className="max-h-48 list-disc overflow-y-auto pl-5 text-xs text-red-700">
          {result.issues.map((entry, index) => (
            <li key={`${entry.path}-${index}`}>
              {entry.code}: {entry.path} {entry.message}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
