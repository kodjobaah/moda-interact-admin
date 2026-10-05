"use client";

import type { Dispatch } from "react";
import type {
  StoreCategoryAuthoringAction,
  StoreCategoryAuthoringSession,
  StoreCategoryAuthoringValidation,
} from "./store-category-authoring-session";
import { storeCategoryAuthoringNow } from "./store-category-authoring-runtime";
import {
  STORE_CATEGORY_AUTHORING_INPUT_CLASS,
  StoreCategoryAuthoringErrorList,
} from "./store-category-authoring-ui";

export function StoreCategoryReviewStep({
  session,
  dispatch,
  validation,
  reviewCurrent,
}: {
  session: StoreCategoryAuthoringSession;
  dispatch: Dispatch<StoreCategoryAuthoringAction>;
  validation: StoreCategoryAuthoringValidation;
  reviewCurrent: boolean;
}) {
  const configurationValid =
    validation.category.valid &&
    validation.defaultTemplate.valid &&
    validation.shopifyMappings.valid;

  return (
    <section aria-labelledby="author-review-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            id="author-review-title"
            className="text-lg font-semibold text-gray-950"
          >
            Review Store Category
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            This complete configuration will be created in one serializable PostgreSQL transaction.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            configurationValid && reviewCurrent
              ? "bg-green-100 text-green-800"
              : "bg-amber-100 text-amber-800"
          }`}
        >
          {configurationValid && reviewCurrent
            ? "Configuration reviewed"
            : "Review required"}
        </span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Category
          </p>
          <p className="mt-2 font-semibold text-gray-950">
            {session.category.displayName}
          </p>
          <p className="mt-1 font-mono text-xs text-gray-500">
            {session.category.slug}
          </p>
          {session.category.referenceTaxonomy ? (
            <p className="mt-3 text-sm text-gray-600">
              Reference: {session.category.referenceTaxonomy.fullName}
            </p>
          ) : null}
          <p className="mt-2 text-sm text-gray-600">
            Created disabled · display order {session.category.displayOrder}
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Default template
          </p>
          <p className="mt-2 font-semibold text-gray-950">
            {session.defaultTemplate.displayName}
          </p>
          <p className="mt-1 font-mono text-xs text-gray-500">
            {session.defaultTemplate.key}
          </p>
          <p className="mt-3 text-sm text-gray-600">
            Enabled · {session.defaultTemplate.promptText.trim().length.toLocaleString()} prompt characters
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Category mappings
          </p>
          <p className="mt-2 text-2xl font-semibold text-gray-950">
            {session.shopifyMappings.length}
          </p>
          <p className="mt-3 text-sm text-gray-600">
            {session.shopifyMappings.length === 0
              ? "Optional mappings can be added later."
              : "Mappings will be created with this category."}
          </p>
          {session.shopifyMappings.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {session.shopifyMappings.map((mapping) => (
                <li key={mapping.clientId} className="rounded-md bg-gray-50 p-2 text-sm">
                  <span className="block font-medium text-gray-900">
                    {mapping.taxonomy?.fullName ?? "Taxonomy selection required"}
                  </span>
                  {mapping.taxonomy ? (
                    <span className="mt-1 block font-mono text-xs text-gray-500">
                      {mapping.taxonomy.categoryId}
                    </span>
                  ) : null}
                  <span className="mt-1 block text-xs text-gray-500">
                    Weight {mapping.weight.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="mt-5 rounded-lg bg-gray-50 p-4">
        <h4 className="text-sm font-semibold text-gray-900">
          Creation readiness
        </h4>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <li>
            {validation.category.valid ? "✓" : "✕"} Category identity complete
          </li>
          <li>
            {validation.defaultTemplate.valid ? "✓" : "✕"} Default prompt configured
          </li>
          <li>
            {validation.shopifyMappings.valid ? "✓" : "✕"} Category mappings valid
          </li>
          <li>{reviewCurrent ? "✓" : "✕"} Review matches current configuration</li>
          <li>{validation.auditReason.valid ? "✓" : "✕"} Audit reason supplied</li>
        </ul>
      </div>

      <label className="mt-5 block text-sm font-medium text-gray-700">
        Audit reason
        <input
          className={STORE_CATEGORY_AUTHORING_INPUT_CLASS}
          value={session.auditReason}
          maxLength={1000}
          onChange={(event) =>
            dispatch({
              type: "audit.changed",
              auditReason: event.target.value,
              now: storeCategoryAuthoringNow(),
            })
          }
          placeholder="Create initial Fashion & Apparel category configuration"
        />
      </label>
      <StoreCategoryAuthoringErrorList issues={validation.auditReason.issues} />
      <p className={`mt-2 text-sm ${
        configurationValid && reviewCurrent && validation.auditReason.valid
          ? "text-green-700"
          : "text-amber-700"
      }`} role="status">
        {configurationValid && reviewCurrent && validation.auditReason.valid
          ? "Ready to create. The complete configuration will be committed atomically."
          : !validation.auditReason.valid
            ? "Add an audit reason before creating this Store Category."
            : !reviewCurrent
              ? "The configuration changed after review. Re-enter Review to confirm the latest version."
              : "Resolve the validation issues above before creating this Store Category."}
      </p>
    </section>
  );
}
