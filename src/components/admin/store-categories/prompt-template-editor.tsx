"use client";

import { useState } from "react";
import { mutateStoreCategoryCatalogueAction } from "@/app/actions/store-categories";
import type { StoreCategoryCatalogue } from "@/lib/admin/store-categories";
import { StoreCategoryPromptConditionEditor } from "./store-category-prompt-condition-editor";

type Category = StoreCategoryCatalogue["categories"][number];
type Template = Category["templates"][number];

const inputClass =
  "mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)] disabled:bg-gray-100 disabled:text-gray-500";

export function PromptTemplateEditor({
  category,
  template,
  heading,
}: {
  category: Category;
  template?: Template;
  heading?: string;
}) {
  const creating = !template;
  const [promptText, setPromptText] = useState(template?.promptText ?? "");
  const conditions = category.taxonomyMappings.flatMap((mapping) =>
    mapping.conditionKey && mapping.displayName
      ? [
          {
            id: mapping.id,
            conditionKey: mapping.conditionKey,
            displayName: mapping.displayName,
          },
        ]
      : [],
  );

  if (category.enabled) {
    return (
      <section>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-sm font-semibold text-gray-900">
            {heading ?? (creating ? "Create prompt template" : template.displayName)}
          </h4>
          {!creating ? (
            <span className="font-mono text-xs text-gray-500">
              {template.key} · {template.enabled ? "Enabled" : "Disabled"} · v
              {template.editVersion}
            </span>
          ) : null}
        </div>
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800">
          This Store Category is enabled. Disable it before creating or changing prompt
          templates because those changes invalidate the reviewed translation/enablement
          configuration.
        </p>
        {template ? (
          <pre className="mt-4 max-h-[36rem] overflow-auto whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-800">
            {template.promptText}
          </pre>
        ) : null}
      </section>
    );
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-gray-900">
          {heading ?? (creating ? "Create prompt template" : template.displayName)}
        </h4>
        {!creating ? (
          <span className="font-mono text-xs text-gray-500">
            {template.key} · {template.enabled ? "Enabled" : "Disabled"} · v
            {template.editVersion}
          </span>
        ) : null}
      </div>
      <form action={mutateStoreCategoryCatalogueAction} className="grid gap-4 sm:grid-cols-2">
        <input
          type="hidden"
          name="intent"
          value={creating ? "create-template" : "update-template"}
        />
        {creating ? (
          <>
            <input type="hidden" name="categoryId" value={category.id} />
            <label className="text-sm font-medium text-gray-700">
              Template key
              <input
                className={inputClass}
                name="key"
                pattern="[a-z][a-z0-9_]{0,127}"
                maxLength={128}
                required
              />
            </label>
          </>
        ) : (
          <>
            <input type="hidden" name="id" value={template.id} />
            <input
              type="hidden"
              name="expectedEditVersion"
              value={template.editVersion}
            />
            <p className="text-sm text-gray-600 sm:col-span-2">
              Template key and category are immutable after creation.
            </p>
          </>
        )}
        <label className="text-sm font-medium text-gray-700">
          Display name
          <input
            className={inputClass}
            name="displayName"
            defaultValue={template?.displayName}
            maxLength={255}
            required
          />
        </label>
        <label className="text-sm font-medium text-gray-700">
          Status
          <select
            className={inputClass}
            name="enabled"
            defaultValue={String(template?.enabled ?? false)}
          >
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        </label>
        <label className="text-sm font-medium text-gray-700 sm:col-span-2">
          Description
          <textarea
            className={inputClass}
            name="description"
            defaultValue={template?.description ?? ""}
            maxLength={2000}
            rows={2}
          />
        </label>
        <div className="sm:col-span-2">
          <p className="mb-2 text-sm font-medium text-gray-700">
            Canonical English conditional prompt
          </p>
          <StoreCategoryPromptConditionEditor
            promptText={promptText}
            onChange={setPromptText}
            conditions={conditions}
            textareaClassName={`${inputClass} min-h-72 font-mono leading-6`}
            textareaName="promptText"
            rows={16}
          />
        </div>
        <label className="text-sm font-medium text-gray-700">
          Audit reason
          <input className={inputClass} name="reason" maxLength={1000} required />
        </label>
        <div className="flex items-end">
          <button
            className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]"
            type="submit"
          >
            {creating ? "Create template" : "Save template"}
          </button>
        </div>
      </form>
    </section>
  );
}
