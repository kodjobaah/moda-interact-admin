"use client";

import { useState } from "react";
import Link from "next/link";
import { mutateModelCatalogueAction } from "@/app/actions/model-catalogue";
import { AdminDetailDrawer } from "@/components/admin/admin-detail-drawer";
import type {
  ModelCatalogueAdminRow,
  ModelCatalogueAvailabilityOption,
} from "@/lib/admin/model-catalogue";
import { ModelCatalogueMutationForm } from "./model-catalogue-mutation-form";

const fieldClass =
  "mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)] disabled:bg-gray-100";
const helperText =
  "Configuration uses OpenRouter request-option field names. Unknown non-reserved OpenRouter options are preserved. Model identity, messages, tools, token budget, credentials, headers and base URL are controlled by Moda and cannot be configured here.";

type ModelCatalogueEditorProps = {
  mode: "create" | "edit" | "view";
  availabilityOptions: ModelCatalogueAvailabilityOption[];
  closeHref: string;
  canMutate: boolean;
  row?: ModelCatalogueAdminRow;
};

function openRouterModelId(provider: string, providerModelId: string): string {
  const normalizedProvider = provider.trim();
  const normalizedModelId = providerModelId.trim();
  return normalizedProvider && normalizedModelId
    ? `${normalizedProvider}/${normalizedModelId}`
    : "";
}

function readOnlyField(label: string, value: string) {
  return (
    <label className="block text-sm font-medium text-gray-800">
      {label}
      <input className={fieldClass} value={value} readOnly />
    </label>
  );
}

function AvailabilityField({
  options,
  selectedId,
  disabled = false,
}: {
  options: ModelCatalogueAvailabilityOption[];
  selectedId?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-gray-800">
      Availability
      <select
        className={fieldClass}
        name="availabilityId"
        defaultValue={selectedId ?? options[0]?.availability.id ?? ""}
        required
        disabled={disabled}
      >
        {options.map((option) => (
          <option key={option.availability.id} value={option.availability.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ConfigurationField({
  value,
  disabled = false,
}: {
  value: string;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-gray-800">
      OpenRouter configuration
      <textarea
        className={`${fieldClass} min-h-52 font-mono text-xs`}
        name="configuration"
        defaultValue={value}
        rows={10}
        spellCheck={false}
        disabled={disabled}
        aria-describedby="model-configuration-help"
        required
      />
      <span
        id="model-configuration-help"
        className="mt-2 block text-xs font-normal leading-5 text-gray-600"
      >
        {helperText}
      </span>
    </label>
  );
}

export function ModelCatalogueEditor({
  mode,
  availabilityOptions,
  closeHref,
  canMutate,
  row,
}: ModelCatalogueEditorProps) {
  const [provider, setProvider] = useState(row?.model.provider ?? "openrouter");
  const [providerModelId, setProviderModelId] = useState(
    row?.model.providerModelId ?? "",
  );
  const canEdit = mode === "edit" && canMutate && row !== undefined;
  const isView = mode === "view" && row !== undefined;

  return (
    <AdminDetailDrawer
      title={
        mode === "create"
          ? "Create model"
          : mode === "edit"
            ? "Edit model"
            : "Model details"
      }
      closeHref={closeHref}
      size="wide"
    >
      {mode === "create" && canMutate ? (
        <ModelCatalogueMutationForm
          action={mutateModelCatalogueAction}
          submitLabel="Create model"
          pendingLabel="Creating…"
        >
          <input type="hidden" name="intent" value="create" />
          <AvailabilityField options={availabilityOptions} />
          <label className="block text-sm font-medium text-gray-800">
            Provider
            <input
              className={fieldClass}
              name="provider"
              value={provider}
              onChange={(event) => setProvider(event.currentTarget.value)}
              autoComplete="off"
              required
            />
          </label>
          <label className="block text-sm font-medium text-gray-800">
            Provider model ID
            <input
              className={fieldClass}
              name="providerModelId"
              value={providerModelId}
              onChange={(event) =>
                setProviderModelId(event.currentTarget.value)
              }
              autoComplete="off"
              required
            />
          </label>
          {readOnlyField(
            "OpenRouter model ID preview",
            openRouterModelId(provider, providerModelId),
          )}
          <label className="block text-sm font-medium text-gray-800">
            Display name
            <input
              className={fieldClass}
              name="displayName"
              maxLength={160}
              required
            />
          </label>
          <label className="block text-sm font-medium text-gray-800">
            Description
            <textarea
              className={fieldClass}
              name="description"
              maxLength={2000}
              rows={3}
            />
          </label>
          <ConfigurationField value="{}" />
        </ModelCatalogueMutationForm>
      ) : null}

      {row && (canEdit || isView) ? (
        <>
          {canEdit ? (
            <ModelCatalogueMutationForm
              action={mutateModelCatalogueAction}
              submitLabel="Save changes"
              pendingLabel="Saving…"
            >
              <input type="hidden" name="intent" value="update" />
              <input type="hidden" name="id" value={row.model.id} />
              <input
                type="hidden"
                name="expectedEditVersion"
                value={row.model.editVersion}
              />
              {readOnlyField("Provider", row.model.provider)}
              {readOnlyField("Provider model ID", row.model.providerModelId)}
              {readOnlyField(
                "OpenRouter model ID",
                openRouterModelId(
                  row.model.provider,
                  row.model.providerModelId,
                ),
              )}
              <AvailabilityField
                options={availabilityOptions}
                selectedId={row.availability.id}
              />
              {row.selectionCount > 0 ? (
                <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm leading-5 text-amber-950">
                  This model is selected by one or more Agent Configurations.
                  Changing its availability or disabling it may make those
                  selections unavailable until corrected in Commerce Studio.
                </p>
              ) : null}
              <label className="block text-sm font-medium text-gray-800">
                Display name
                <input
                  className={fieldClass}
                  name="displayName"
                  defaultValue={row.model.displayName}
                  maxLength={160}
                  required
                />
              </label>
              <label className="block text-sm font-medium text-gray-800">
                Description
                <textarea
                  className={fieldClass}
                  name="description"
                  defaultValue={row.model.description}
                  maxLength={2000}
                  rows={3}
                />
              </label>
              <ConfigurationField
                value={JSON.stringify(row.model.configuration, null, 2)}
              />
              <p className="text-sm text-gray-700">
                <span className="font-medium text-gray-800">Selections</span>
                <span className="ml-2 tabular-nums">{row.selectionCount}</span>
              </p>
            </ModelCatalogueMutationForm>
          ) : null}

          {canEdit ? (
            <div className="mt-6 border-t border-gray-200 pt-5">
              <h3 className="text-sm font-semibold text-gray-900">
                Catalogue status
              </h3>
              <ModelCatalogueMutationForm
                action={mutateModelCatalogueAction}
                submitLabel={
                  row.model.enabled ? "Disable model" : "Enable model"
                }
                pendingLabel={row.model.enabled ? "Disabling…" : "Enabling…"}
              >
                <input type="hidden" name="intent" value="set-enabled" />
                <input type="hidden" name="id" value={row.model.id} />
                <input
                  type="hidden"
                  name="expectedEditVersion"
                  value={row.model.editVersion}
                />
                <input
                  type="hidden"
                  name="enabled"
                  value={String(!row.model.enabled)}
                />
              </ModelCatalogueMutationForm>
            </div>
          ) : null}

          {isView ? (
            <div className="space-y-4">
              {readOnlyField("Provider", row.model.provider)}
              {readOnlyField("Provider model ID", row.model.providerModelId)}
              {readOnlyField(
                "OpenRouter model ID",
                openRouterModelId(
                  row.model.provider,
                  row.model.providerModelId,
                ),
              )}
              {readOnlyField("Availability", row.availabilityLabel)}
              {readOnlyField("Display name", row.model.displayName)}
              <div>
                <span className="text-sm font-medium text-gray-800">
                  Description
                </span>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
                  {row.model.description || "None"}
                </p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-800">
                  OpenRouter configuration
                </span>
                <pre className="mt-1 overflow-x-auto rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800">
                  {JSON.stringify(row.model.configuration, null, 2)}
                </pre>
              </div>
              <p className="text-sm text-gray-700">
                {row.selectionCount} Agent Configuration selections
              </p>
            </div>
          ) : null}
        </>
      ) : null}
      {mode === "create" && !canMutate ? (
        <p className="text-sm text-gray-600">
          Model catalogue entries are read-only for your role.
        </p>
      ) : null}
      <Link
        href={closeHref}
        className="mt-6 inline-block text-sm font-semibold text-[var(--brand-700)] hover:underline"
      >
        Close
      </Link>
    </AdminDetailDrawer>
  );
}
