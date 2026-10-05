"use client";

import type { Dispatch } from "react";
import {
  canEnterStoreCategoryAuthoringStep,
  isStoreCategoryReviewCurrent,
  type StoreCategoryAuthoringAction,
  type StoreCategoryAuthoringSession,
  type StoreCategoryAuthoringStep,
} from "./store-category-authoring-session";
import { storeCategoryAuthoringNow } from "./store-category-authoring-runtime";

export const STORE_CATEGORY_AUTHORING_STEPS: Array<{
  step: StoreCategoryAuthoringStep;
  label: string;
  description: string;
}> = [
  {
    step: "category",
    label: "Category",
    description: "Identity and display metadata",
  },
  {
    step: "template",
    label: "Default template",
    description: "Required canonical-English prompt",
  },
  {
    step: "mappings",
    label: "Category mappings",
    description: "Optional taxonomy suggestions",
  },
  {
    step: "review",
    label: "Review",
    description: "Validate and create atomically",
  },
];

export function StoreCategoryAuthoringStepNavigation({
  session,
  dispatch,
}: {
  session: StoreCategoryAuthoringSession;
  dispatch: Dispatch<StoreCategoryAuthoringAction>;
}) {
  const currentStepIndex = STORE_CATEGORY_AUTHORING_STEPS.findIndex(
    (entry) => entry.step === session.step,
  );
  const reviewCurrent = isStoreCategoryReviewCurrent(session);

  return (
    <nav
      aria-label="Store Category creation steps"
      className="border-b border-gray-200 px-5"
    >
      <ol className="grid gap-0 md:grid-cols-4">
        {STORE_CATEGORY_AUTHORING_STEPS.map((entry, index) => {
          const active = entry.step === session.step;
          const accessible = canEnterStoreCategoryAuthoringStep(
            session,
            entry.step,
          );
          const completed =
            index < currentStepIndex ||
            (entry.step === "review" && reviewCurrent);

          return (
            <li key={entry.step}>
              <button
                type="button"
                disabled={!accessible || session.status === "SAVING"}
                onClick={() =>
                  dispatch({
                    type: "step.changed",
                    step: entry.step,
                    now: storeCategoryAuthoringNow(),
                  })
                }
                className={`w-full border-b-2 px-4 py-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  active
                    ? "border-[var(--brand-700)] text-[var(--brand-900)]"
                    : "border-transparent text-gray-600 hover:border-gray-300"
                }`}
              >
                <span className="block text-xs font-semibold uppercase tracking-wide">
                  {index + 1}. {entry.label} {completed ? "✓" : ""}
                </span>
                <span className="mt-1 block text-xs text-gray-500">
                  {entry.description}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
