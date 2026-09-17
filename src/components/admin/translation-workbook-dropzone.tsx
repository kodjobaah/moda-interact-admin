"use client";

import { useRef, useState } from "react";

const XLSX_ACCEPT =
  ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function TranslationWorkbookDropzone({
  onFile,
  onSelectionError,
  disabled = false,
}: {
  onFile: (file: File) => void | Promise<void>;
  onSelectionError: (message: string) => void;
  disabled?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function processFiles(files: FileList | null) {
    if (disabled || !files?.length) return;
    if (files.length !== 1) {
      onSelectionError("Upload one spreadsheet at a time.");
      return;
    }
    void onFile(files[0]);
  }

  return (
    <div
      className={`rounded-md border bg-white p-4 text-center text-sm ${
        disabled
          ? "border-gray-200 opacity-60"
          : isDragging
            ? "border-[var(--brand-700)]"
            : "border-gray-300"
      }`}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        if (event.currentTarget.contains(event.relatedTarget as Node | null))
          return;
        setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        processFiles(event.dataTransfer.files);
      }}
    >
      <p className="font-semibold">Upload completed translation spreadsheet</p>
      <p className="mt-1">Drop your completed .xlsx spreadsheet here</p>
      <p>or</p>
      <button
        type="button"
        disabled={disabled}
        className={`mt-1 rounded-md border px-3 py-2 font-semibold disabled:cursor-not-allowed ${isDragging ? "border-[var(--brand-700)]" : "border-gray-400"}`}
        onClick={() => fileInputRef.current?.click()}
      >
        Choose spreadsheet
      </button>
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        disabled={disabled}
        accept={XLSX_ACCEPT}
        onChange={(event) => {
          processFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <p className="mt-2 text-xs text-gray-600">
        .xlsx only · maximum size 2 MiB
      </p>
    </div>
  );
}
