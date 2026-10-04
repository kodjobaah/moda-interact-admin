"use client";

import { useEffect, useReducer, useState, type Dispatch } from "react";
import { useRouter } from "next/navigation";
import { createStoreCategoryBundleAction } from "@/app/actions/store-categories";
import {
  STORE_CATEGORY_AUTHORING_STORAGE_KEY,
  canCreateStoreCategoryFromSession,
  canEnterStoreCategoryAuthoringStep,
  createStoreCategoryBundlePayload,
  isStoreCategoryReviewCurrent,
  restoreStoreCategoryAuthoringSession,
  storeCategoryAuthoringReducer,
  validateStoreCategoryAuthoringSession,
  type StoreCategoryAuthoringAction,
  type StoreCategoryAuthoringSession,
  type StoreCategoryAuthoringStep,
} from "./store-category-authoring-session";

const inputClass =
  "mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)]";

const STEPS: Array<{
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
    label: "Shopify mappings",
    description: "Optional taxonomy suggestions",
  },
  {
    step: "review",
    label: "Review",
    description: "Validate and create atomically",
  },
];

function now() {
  return new Date().toISOString();
}

function makeClientId() {
  return window.crypto.randomUUID();
}

function ErrorList({ issues }: { issues: string[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1 text-sm text-amber-800" role="status">
      {issues.map((issue) => (
        <li key={issue}>• {issue}</li>
      ))}
    </ul>
  );
}

function SectionStatus({ valid }: { valid: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-xs font-medium ${
        valid ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
      }`}
    >
      {valid ? "Complete" : "Needs attention"}
    </span>
  );
}

export function StoreCategoryCreationWorkspace() {
  const router = useRouter();
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
            Create the category identity, required default template, and optional Shopify mappings as one configuration.
          </p>
        </div>
        <button
          type="button"
          className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]"
          onClick={() =>
            dispatch({
              type: "session.started",
              sessionId: makeClientId(),
              now: now(),
            })
          }
        >
          + Create Store Category
        </button>
      </div>
    );
  }

  return <AuthoringSession session={session} dispatch={dispatch} router={router} />;
}

function AuthoringSession({
  session,
  dispatch,
  router,
}: {
  session: StoreCategoryAuthoringSession;
  dispatch: Dispatch<StoreCategoryAuthoringAction>;
  router: ReturnType<typeof useRouter>;
}) {
  const validation = validateStoreCategoryAuthoringSession(session);
  const reviewCurrent = isStoreCategoryReviewCurrent(session);
  const canCreate = canCreateStoreCategoryFromSession(session);
  const currentStepIndex = STEPS.findIndex((entry) => entry.step === session.step);
  const reviewStale =
    session.reviewedRevision !== null &&
    session.reviewedRevision !== session.validationRevision;

  function changeStep(step: StoreCategoryAuthoringStep) {
    dispatch({ type: "step.changed", step, now: now() });
  }

  async function createCategory() {
    if (!canCreateStoreCategoryFromSession(session)) return;
    dispatch({ type: "save.started", now: now() });
    try {
      const result = await createStoreCategoryBundleAction(
        createStoreCategoryBundlePayload(session),
      );
      dispatch({ type: "save.succeeded", now: now() });
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
        now: now(),
      });
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

      <nav aria-label="Store Category creation steps" className="border-b border-gray-200 px-5">
        <ol className="grid gap-0 md:grid-cols-4">
          {STEPS.map((entry, index) => {
            const active = entry.step === session.step;
            const accessible = canEnterStoreCategoryAuthoringStep(session, entry.step);
            const completed = index < currentStepIndex || entry.step === "review" && reviewCurrent;
            return (
              <li key={entry.step}>
                <button
                  type="button"
                  disabled={!accessible || session.status === "SAVING"}
                  onClick={() => changeStep(entry.step)}
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

      <div className="px-5 py-6">
        {session.step === "category" ? (
          <CategoryStep session={session} dispatch={dispatch} />
        ) : null}
        {session.step === "template" ? (
          <TemplateStep session={session} dispatch={dispatch} />
        ) : null}
        {session.step === "mappings" ? (
          <MappingsStep session={session} dispatch={dispatch} />
        ) : null}
        {session.step === "review" ? (
          <ReviewStep
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
            onClick={() => changeStep(STEPS[currentStepIndex - 1]!.step)}
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
                  STEPS[currentStepIndex + 1]!.step,
                )
              }
              onClick={() => changeStep(STEPS[currentStepIndex + 1]!.step)}
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

function CategoryStep({
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
          <h3 id="author-category-title" className="text-lg font-semibold text-gray-950">
            Category identity
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            Define the immutable slug and merchant-facing category metadata.
          </p>
        </div>
        <SectionStatus valid={validation.valid} />
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium text-gray-700">
          Stable slug
          <input
            className={inputClass}
            value={session.category.slug}
            maxLength={128}
            onChange={(event) =>
              dispatch({
                type: "category.changed",
                patch: { slug: event.target.value },
                now: now(),
              })
            }
            placeholder="fashion-apparel"
          />
        </label>
        <label className="text-sm font-medium text-gray-700 lg:col-span-2">
          Display name
          <input
            className={inputClass}
            value={session.category.displayName}
            maxLength={255}
            onChange={(event) =>
              dispatch({
                type: "category.changed",
                patch: { displayName: event.target.value },
                now: now(),
              })
            }
            placeholder="Fashion & Apparel"
          />
        </label>
        <label className="text-sm font-medium text-gray-700">
          Display order
          <input
            className={inputClass}
            type="number"
            min={0}
            max={1_000_000}
            value={session.category.displayOrder}
            onChange={(event) =>
              dispatch({
                type: "category.changed",
                patch: { displayOrder: Number(event.target.value) },
                now: now(),
              })
            }
          />
        </label>
        <label className="text-sm font-medium text-gray-700 sm:col-span-2 lg:col-span-4">
          Description
          <textarea
            className={inputClass}
            value={session.category.description}
            maxLength={2000}
            rows={3}
            onChange={(event) =>
              dispatch({
                type: "category.changed",
                patch: { description: event.target.value },
                now: now(),
              })
            }
          />
        </label>
      </div>
      <p className="mt-4 rounded-md bg-gray-50 p-3 text-sm text-gray-600">
        New categories are created disabled. They can be enabled later once Shopify localization keys are available.
      </p>
      <ErrorList issues={validation.issues} />
    </section>
  );
}

function TemplateStep({
  session,
  dispatch,
}: {
  session: StoreCategoryAuthoringSession;
  dispatch: Dispatch<StoreCategoryAuthoringAction>;
}) {
  const validation = validateStoreCategoryAuthoringSession(session).defaultTemplate;
  return (
    <section aria-labelledby="author-template-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 id="author-template-title" className="text-lg font-semibold text-gray-950">
            Default prompt template
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            Every new Store Category starts with one enabled, non-empty default template.
          </p>
        </div>
        <SectionStatus valid={validation.valid} />
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-700">
          Template key
          <input
            className={inputClass}
            value={session.defaultTemplate.key}
            maxLength={128}
            onChange={(event) =>
              dispatch({
                type: "template.changed",
                patch: { key: event.target.value },
                now: now(),
              })
            }
            placeholder="fashion_apparel_default"
          />
        </label>
        <label className="text-sm font-medium text-gray-700">
          Display name
          <input
            className={inputClass}
            value={session.defaultTemplate.displayName}
            maxLength={255}
            onChange={(event) =>
              dispatch({
                type: "template.changed",
                patch: { displayName: event.target.value },
                now: now(),
              })
            }
            placeholder="Fashion & Apparel default"
          />
        </label>
        <label className="text-sm font-medium text-gray-700 sm:col-span-2">
          Description
          <textarea
            className={inputClass}
            value={session.defaultTemplate.description}
            maxLength={2000}
            rows={2}
            onChange={(event) =>
              dispatch({
                type: "template.changed",
                patch: { description: event.target.value },
                now: now(),
              })
            }
          />
        </label>
        <label className="text-sm font-medium text-gray-700 sm:col-span-2">
          Canonical English prompt
          <textarea
            className={`${inputClass} min-h-80 font-mono leading-6`}
            value={session.defaultTemplate.promptText}
            maxLength={100_000}
            rows={18}
            onChange={(event) =>
              dispatch({
                type: "template.changed",
                patch: { promptText: event.target.value },
                now: now(),
              })
            }
            placeholder="Describe how CommerceAgent should support customers in this store category…"
          />
        </label>
      </div>
      <ErrorList issues={validation.issues} />
    </section>
  );
}

function MappingsStep({
  session,
  dispatch,
}: {
  session: StoreCategoryAuthoringSession;
  dispatch: Dispatch<StoreCategoryAuthoringAction>;
}) {
  const validation = validateStoreCategoryAuthoringSession(session).shopifyMappings;
  return (
    <section aria-labelledby="author-mappings-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="author-mappings-title" className="text-lg font-semibold text-gray-950">
            Shopify taxonomy mappings
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            Optional. Add taxonomy categories that should suggest this Store Category.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SectionStatus valid={validation.valid} />
          <button
            type="button"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
            onClick={() =>
              dispatch({
                type: "mapping.added",
                mapping: {
                  clientId: makeClientId(),
                  shopifyTaxonomyCategoryId: "",
                  weight: 1,
                },
                now: now(),
              })
            }
          >
            + Add mapping
          </button>
        </div>
      </div>

      {session.shopifyMappings.length === 0 ? (
        <div className="mt-5 rounded-md border border-dashed border-gray-300 p-6 text-sm text-gray-600">
          No Shopify mappings. You can continue without mappings and add them later.
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {session.shopifyMappings.map((mapping, index) => (
            <div
              key={mapping.clientId}
              className="grid gap-3 rounded-md border border-gray-200 bg-gray-50 p-4 sm:grid-cols-[minmax(0,1fr)_8rem_auto]"
            >
              <label className="text-sm font-medium text-gray-700">
                Shopify taxonomy category ID {index + 1}
                <input
                  className={inputClass}
                  value={mapping.shopifyTaxonomyCategoryId}
                  maxLength={255}
                  onChange={(event) =>
                    dispatch({
                      type: "mapping.changed",
                      clientId: mapping.clientId,
                      patch: { shopifyTaxonomyCategoryId: event.target.value },
                      now: now(),
                    })
                  }
                  placeholder="gid://shopify/TaxonomyCategory/..."
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Weight
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  max={1_000_000}
                  value={mapping.weight}
                  onChange={(event) =>
                    dispatch({
                      type: "mapping.changed",
                      clientId: mapping.clientId,
                      patch: { weight: Number(event.target.value) },
                      now: now(),
                    })
                  }
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                  onClick={() =>
                    dispatch({
                      type: "mapping.removed",
                      clientId: mapping.clientId,
                      now: now(),
                    })
                  }
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <ErrorList issues={validation.issues} />
    </section>
  );
}

function ReviewStep({
  session,
  dispatch,
  validation,
  reviewCurrent,
}: {
  session: StoreCategoryAuthoringSession;
  dispatch: Dispatch<StoreCategoryAuthoringAction>;
  validation: ReturnType<typeof validateStoreCategoryAuthoringSession>;
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
          <h3 id="author-review-title" className="text-lg font-semibold text-gray-950">
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
          {configurationValid && reviewCurrent ? "Configuration reviewed" : "Review required"}
        </span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Category
          </p>
          <p className="mt-2 font-semibold text-gray-950">{session.category.displayName}</p>
          <p className="mt-1 font-mono text-xs text-gray-500">{session.category.slug}</p>
          <p className="mt-3 text-sm text-gray-600">
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
            Shopify mappings
          </p>
          <p className="mt-2 text-2xl font-semibold text-gray-950">
            {session.shopifyMappings.length}
          </p>
          <p className="mt-3 text-sm text-gray-600">
            {session.shopifyMappings.length === 0
              ? "Optional mappings can be added later."
              : "Mappings will be created with this category."}
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-lg bg-gray-50 p-4">
        <h4 className="text-sm font-semibold text-gray-900">Creation readiness</h4>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <li>{validation.category.valid ? "✓" : "✕"} Category identity complete</li>
          <li>{validation.defaultTemplate.valid ? "✓" : "✕"} Default prompt configured</li>
          <li>{validation.shopifyMappings.valid ? "✓" : "✕"} Shopify mappings valid</li>
          <li>{reviewCurrent ? "✓" : "✕"} Review matches current configuration</li>
        </ul>
      </div>

      <label className="mt-5 block text-sm font-medium text-gray-700">
        Audit reason
        <input
          className={inputClass}
          value={session.auditReason}
          maxLength={1000}
          onChange={(event) =>
            dispatch({
              type: "audit.changed",
              auditReason: event.target.value,
              now: now(),
            })
          }
          placeholder="Create initial Fashion & Apparel category configuration"
        />
      </label>
      <ErrorList issues={validation.auditReason.issues} />
    </section>
  );
}
