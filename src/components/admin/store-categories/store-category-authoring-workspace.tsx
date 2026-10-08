"use client";

import { useRef, type Dispatch } from "react";
import { useRouter } from "next/navigation";
import { createStoreCategoryBundleAction } from "@/app/actions/store-categories";
import {
  STORE_CATEGORY_AUTHORING_STORAGE_KEY,
  canCreateStoreCategoryFromSession,
  canEnterStoreCategoryAuthoringStep,
  createStoreCategoryBundlePayload,
  isStoreCategoryReviewCurrent,
  validateStoreCategoryAuthoringSession,
  type StoreCategoryAuthoringAction,
  type StoreCategoryAuthoringSession,
  type StoreCategoryAuthoringStep,
} from "./store-category-authoring-session";
import {
  STORE_CATEGORY_AUTHORING_STEPS,
  StoreCategoryAuthoringStepNavigation,
} from "./store-category-authoring-step-navigation";
import { StoreCategoryCategoryStep } from "./store-category-category-step";
import { StoreCategoryTemplateStep } from "./store-category-template-step";
import { StoreCategoryMappingsStep } from "./store-category-mappings-step";
import { StoreCategoryReviewStep } from "./store-category-review-step";
import { storeCategoryAuthoringNow } from "./store-category-authoring-runtime";
import type { AssignedReferenceTaxonomyCategory } from "./store-category-authoring-types";

export function StoreCategoryAuthoringWorkspace({
  session,
  dispatch,
  taxonomyReady,
  assignedReferenceTaxonomy,
}: {
  session: StoreCategoryAuthoringSession;
  dispatch: Dispatch<StoreCategoryAuthoringAction>;
  taxonomyReady: boolean;
  assignedReferenceTaxonomy: AssignedReferenceTaxonomyCategory[];
}) {
  const router = useRouter();
  const createInFlightRef = useRef(false);
  const validation = validateStoreCategoryAuthoringSession(session);
  const reviewCurrent = isStoreCategoryReviewCurrent(session);
  const canCreate = canCreateStoreCategoryFromSession(session);
  const currentStepIndex = STORE_CATEGORY_AUTHORING_STEPS.findIndex(
    (entry) => entry.step === session.step,
  );
  const previousStep =
    currentStepIndex > 0
      ? STORE_CATEGORY_AUTHORING_STEPS[currentStepIndex - 1]?.step ?? null
      : null;
  const nextStep =
    currentStepIndex >= 0 &&
    currentStepIndex < STORE_CATEGORY_AUTHORING_STEPS.length - 1
      ? STORE_CATEGORY_AUTHORING_STEPS[currentStepIndex + 1]?.step ?? null
      : null;
  const reviewStale =
    session.reviewedRevision !== null &&
    session.reviewedRevision !== session.validationRevision;
  const selectedReferenceAssignment = assignedReferenceTaxonomy.find(
    (assignment) =>
      assignment.categoryId === session.category.referenceTaxonomy?.categoryId,
  );
  const categoryReferenceAvailable = !selectedReferenceAssignment;

  function changeStep(step: StoreCategoryAuthoringStep) {
    if (!categoryReferenceAvailable && step !== "category") return;
    dispatch({ type: "step.changed", step, now: storeCategoryAuthoringNow() });
  }

  async function createCategory() {
    if (
      createInFlightRef.current ||
      !categoryReferenceAvailable ||
      !canCreateStoreCategoryFromSession(session)
    ) {
      return;
    }
    createInFlightRef.current = true;
    dispatch({ type: "save.started", now: storeCategoryAuthoringNow() });
    try {
      const result = await createStoreCategoryBundleAction(
        createStoreCategoryBundlePayload(session),
      );
      if (!result.ok) {
        dispatch({
          type: "save.failed",
          error: result.message,
          now: storeCategoryAuthoringNow(),
        });
        return;
      }

      dispatch({ type: "save.succeeded", now: storeCategoryAuthoringNow() });
      window.sessionStorage.removeItem(STORE_CATEGORY_AUTHORING_STORAGE_KEY);
      router.replace(
        `/system-controls/store-categories?category=${encodeURIComponent(result.categoryId)}&tab=details`,
      );
      router.refresh();
    } catch (error) {
      dispatch({
        type: "save.failed",
        error:
          error instanceof Error
            ? error.message
            : "The Store Category could not be created.",
        now: storeCategoryAuthoringNow(),
      });
    } finally {
      createInFlightRef.current = false;
    }
  }

  return (
    <section className="mb-8 overflow-hidden rounded-xl border border-[var(--brand-200)] bg-white shadow-sm">
      <div className="flex flex-col justify-between gap-4 border-b border-gray-200 px-5 py-5 sm:flex-row sm:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-[var(--brand-900)]">
              Create Store Category
            </h2>
            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
              Browser draft
            </span>
            {reviewStale ? (
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                Review needs updating
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-gray-600">
            Nothing is written to PostgreSQL until the final Review step saves this disabled draft.
          </p>
          <p className="mt-1 font-mono text-xs text-gray-400">
            Session {session.sessionId}
          </p>
          {!taxonomyReady ? (
            <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
              The reference taxonomy search index is not ready. Your browser draft is preserved, but synchronize the index before selecting taxonomy categories or creating this Store Category.
            </p>
          ) : null}
          {selectedReferenceAssignment ? (
            <p
              className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800"
              role="status"
            >
              The selected reference taxonomy category is already assigned to Store
              Category “{selectedReferenceAssignment.storeCategoryDisplayName}”.
              Return to Category and choose another reference category.
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          onClick={() => {
            if (
              window.confirm(
                "Discard this Store Category draft from this browser session?",
              )
            ) {
              dispatch({ type: "session.discarded" });
            }
          }}
        >
          Discard draft
        </button>
      </div>

      <StoreCategoryAuthoringStepNavigation
        session={session}
        dispatch={dispatch}
        categoryReferenceAvailable={categoryReferenceAvailable}
      />

      <div className="px-5 py-6">
        {session.step === "category" ? (
          <StoreCategoryCategoryStep
            session={session}
            dispatch={dispatch}
            assignedReferenceTaxonomy={assignedReferenceTaxonomy}
          />
        ) : null}
        {session.step === "mappings" ? (
          <StoreCategoryMappingsStep session={session} dispatch={dispatch} />
        ) : null}
        {session.step === "template" ? (
          <StoreCategoryTemplateStep session={session} dispatch={dispatch} />
        ) : null}
        {session.step === "review" ? (
          <StoreCategoryReviewStep
            session={session}
            dispatch={dispatch}
            validation={validation}
            reviewCurrent={reviewCurrent}
          />
        ) : null}

        {session.error ? (
          <p
            className="mt-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            role="status"
          >
            {session.error}
          </p>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-5">
          <button
            type="button"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!previousStep || session.status === "SAVING"}
            onClick={() => {
              if (previousStep) changeStep(previousStep);
            }}
          >
            Back
          </button>

          {session.step !== "review" ? (
            <button
              type="button"
              className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={
                session.status === "SAVING" ||
                !categoryReferenceAvailable ||
                !nextStep ||
                !canEnterStoreCategoryAuthoringStep(session, nextStep)
              }
              onClick={() => {
                if (nextStep) changeStep(nextStep);
              }}
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              className="rounded-md bg-[var(--brand-700)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={
                !taxonomyReady ||
                !categoryReferenceAvailable ||
                !canCreate ||
                session.status === "SAVING"
              }
              onClick={() => void createCategory()}
            >
              {session.status === "SAVING"
                ? "Saving Store Category…"
                : "Save Store Category Draft"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
