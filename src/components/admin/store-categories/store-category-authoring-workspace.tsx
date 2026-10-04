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

export function StoreCategoryAuthoringWorkspace({
  session,
  dispatch,
}: {
  session: StoreCategoryAuthoringSession;
  dispatch: Dispatch<StoreCategoryAuthoringAction>;
}) {
  const router = useRouter();
  const createInFlightRef = useRef(false);
  const validation = validateStoreCategoryAuthoringSession(session);
  const reviewCurrent = isStoreCategoryReviewCurrent(session);
  const canCreate = canCreateStoreCategoryFromSession(session);
  const currentStepIndex = STORE_CATEGORY_AUTHORING_STEPS.findIndex(
    (entry) => entry.step === session.step,
  );
  const reviewStale =
    session.reviewedRevision !== null &&
    session.reviewedRevision !== session.validationRevision;

  function changeStep(step: StoreCategoryAuthoringStep) {
    dispatch({ type: "step.changed", step, now: storeCategoryAuthoringNow() });
  }

  async function createCategory() {
    if (createInFlightRef.current || !canCreateStoreCategoryFromSession(session)) {
      return;
    }
    createInFlightRef.current = true;
    dispatch({ type: "save.started", now: storeCategoryAuthoringNow() });
    try {
      const result = await createStoreCategoryBundleAction(
        createStoreCategoryBundlePayload(session),
      );
      dispatch({ type: "save.succeeded", now: storeCategoryAuthoringNow() });
      window.sessionStorage.removeItem(STORE_CATEGORY_AUTHORING_STORAGE_KEY);
      router.push(
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
            Nothing is written to PostgreSQL until the final Review step succeeds.
          </p>
          <p className="mt-1 font-mono text-xs text-gray-400">
            Session {session.sessionId}
          </p>
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
      />

      <div className="px-5 py-6">
        {session.step === "category" ? (
          <StoreCategoryCategoryStep session={session} dispatch={dispatch} />
        ) : null}
        {session.step === "template" ? (
          <StoreCategoryTemplateStep session={session} dispatch={dispatch} />
        ) : null}
        {session.step === "mappings" ? (
          <StoreCategoryMappingsStep session={session} dispatch={dispatch} />
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
            disabled={currentStepIndex === 0 || session.status === "SAVING"}
            onClick={() =>
              changeStep(
                STORE_CATEGORY_AUTHORING_STEPS[currentStepIndex - 1]!.step,
              )
            }
          >
            Back
          </button>

          {session.step !== "review" ? (
            <button
              type="button"
              className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={
                session.status === "SAVING" ||
                !canEnterStoreCategoryAuthoringStep(
                  session,
                  STORE_CATEGORY_AUTHORING_STEPS[currentStepIndex + 1]!.step,
                )
              }
              onClick={() =>
                changeStep(
                  STORE_CATEGORY_AUTHORING_STEPS[currentStepIndex + 1]!.step,
                )
              }
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              className="rounded-md bg-[var(--brand-700)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canCreate || session.status === "SAVING"}
              onClick={() => void createCategory()}
            >
              {session.status === "SAVING"
                ? "Creating Store Category…"
                : "Create Store Category"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
