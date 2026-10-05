"use client";

import { useEffect, useReducer, useState } from "react";
import {
  STORE_CATEGORY_AUTHORING_STORAGE_KEY,
  restoreStoreCategoryAuthoringSession,
  storeCategoryAuthoringReducer,
} from "./store-category-authoring-session";
import { StoreCategoryAuthoringWorkspace } from "./store-category-authoring-workspace";
import type { AssignedReferenceTaxonomyCategory } from "./store-category-authoring-types";
import {
  createStoreCategoryAuthoringClientId,
  storeCategoryAuthoringNow,
} from "./store-category-authoring-runtime";

export function StoreCategoryCreationWorkspace({
  taxonomyReady,
  assignedReferenceTaxonomy,
}: {
  taxonomyReady: boolean;
  assignedReferenceTaxonomy: AssignedReferenceTaxonomyCategory[];
}) {
  const [session, dispatch] = useReducer(storeCategoryAuthoringReducer, null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    dispatch({
      type: "session.restored",
      session: restoreStoreCategoryAuthoringSession(
        window.sessionStorage.getItem(STORE_CATEGORY_AUTHORING_STORAGE_KEY),
      ),
    });
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!session) {
      window.sessionStorage.removeItem(STORE_CATEGORY_AUTHORING_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(
      STORE_CATEGORY_AUTHORING_STORAGE_KEY,
      JSON.stringify(session),
    );
  }, [hydrated, session]);

  if (!hydrated) {
    return (
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-500 shadow-sm">
        Loading category authoring workspace…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mb-8 flex flex-col justify-between gap-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
        <div>
          <h2 className="text-base font-semibold text-gray-950">
            Create Store Category
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Create the reference-backed category identity, required default template, and optional category mappings as one configuration.
          </p>
          {!taxonomyReady ? (
            <p className="mt-2 text-sm font-medium text-amber-700">
              Synchronize the reference taxonomy search index before starting a new Store Category.
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)] disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!taxonomyReady}
          onClick={() =>
            dispatch({
              type: "session.started",
              sessionId: createStoreCategoryAuthoringClientId(),
              now: storeCategoryAuthoringNow(),
            })
          }
        >
          + Create Store Category
        </button>
      </div>
    );
  }

  return (
    <StoreCategoryAuthoringWorkspace
      session={session}
      dispatch={dispatch}
      taxonomyReady={taxonomyReady}
      assignedReferenceTaxonomy={assignedReferenceTaxonomy}
    />
  );
}
