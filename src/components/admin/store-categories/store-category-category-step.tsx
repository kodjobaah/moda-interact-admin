"use client";

import type { Dispatch } from "react";
import {
  validateStoreCategoryAuthoringSession,
  type StoreCategoryAuthoringAction,
  type StoreCategoryAuthoringSession,
} from "./store-category-authoring-session";
import { storeCategoryAuthoringNow } from "./store-category-authoring-runtime";
import {
  STORE_CATEGORY_AUTHORING_INPUT_CLASS,
  StoreCategoryAuthoringErrorList,
  StoreCategoryAuthoringSectionStatus,
} from "./store-category-authoring-ui";

export function StoreCategoryCategoryStep({
  session,
  dispatch,
}: {
  session: StoreCategoryAuthoringSession;
  dispatch: Dispatch<StoreCategoryAuthoringAction>;
}) {
  const validation = validateStoreCategoryAuthoringSession(session).category;

  return (
    <section aria-labelledby="author-category-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3
            id="author-category-title"
            className="text-lg font-semibold text-gray-950"
          >
            Category identity
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            Define the immutable slug and merchant-facing category metadata.
          </p>
        </div>
        <StoreCategoryAuthoringSectionStatus valid={validation.valid} />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium text-gray-700">
          Stable slug
          <input
            className={STORE_CATEGORY_AUTHORING_INPUT_CLASS}
            value={session.category.slug}
            maxLength={128}
            onChange={(event) =>
              dispatch({
                type: "category.changed",
                patch: { slug: event.target.value },
                now: storeCategoryAuthoringNow(),
              })
            }
            placeholder="fashion-apparel"
          />
        </label>

        <label className="text-sm font-medium text-gray-700 lg:col-span-2">
          Display name
          <input
            className={STORE_CATEGORY_AUTHORING_INPUT_CLASS}
            value={session.category.displayName}
            maxLength={255}
            onChange={(event) =>
              dispatch({
                type: "category.changed",
                patch: { displayName: event.target.value },
                now: storeCategoryAuthoringNow(),
              })
            }
            placeholder="Fashion & Apparel"
          />
        </label>

        <label className="text-sm font-medium text-gray-700">
          Display order
          <input
            className={STORE_CATEGORY_AUTHORING_INPUT_CLASS}
            type="number"
            min={0}
            max={1_000_000}
            value={session.category.displayOrder}
            onChange={(event) =>
              dispatch({
                type: "category.changed",
                patch: { displayOrder: Number(event.target.value) },
                now: storeCategoryAuthoringNow(),
              })
            }
          />
        </label>

        <label className="text-sm font-medium text-gray-700 sm:col-span-2 lg:col-span-4">
          Description
          <textarea
            className={STORE_CATEGORY_AUTHORING_INPUT_CLASS}
            value={session.category.description}
            maxLength={2000}
            rows={3}
            onChange={(event) =>
              dispatch({
                type: "category.changed",
                patch: { description: event.target.value },
                now: storeCategoryAuthoringNow(),
              })
            }
          />
        </label>
      </div>

      <p className="mt-4 rounded-md bg-gray-50 p-3 text-sm text-gray-600">
        New categories are created disabled. They can be enabled later once Shopify localization keys are available.
      </p>
      <StoreCategoryAuthoringErrorList issues={validation.issues} />
    </section>
  );
}
