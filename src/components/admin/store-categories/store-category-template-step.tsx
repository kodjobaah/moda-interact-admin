"use client";

import type { Dispatch } from "react";
import {
  validateStoreCategoryAuthoringSession,
  type StoreCategoryAuthoringAction,
  type StoreCategoryAuthoringSession,
} from "./store-category-authoring-session";
import { storeCategoryAuthoringNow } from "./store-category-authoring-runtime";
import { StoreCategoryPromptConditionEditor } from "./store-category-prompt-condition-editor";
import {
  STORE_CATEGORY_AUTHORING_INPUT_CLASS,
  StoreCategoryAuthoringErrorList,
  StoreCategoryAuthoringSectionStatus,
} from "./store-category-authoring-ui";

export function StoreCategoryTemplateStep({
  session,
  dispatch,
}: {
  session: StoreCategoryAuthoringSession;
  dispatch: Dispatch<StoreCategoryAuthoringAction>;
}) {
  const validation =
    validateStoreCategoryAuthoringSession(session).defaultTemplate;
  const conditions = session.shopifyMappings
    .filter((mapping) => mapping.conditionKey.trim() && mapping.displayName.trim())
    .map((mapping) => ({
      id: mapping.clientId,
      conditionKey: mapping.conditionKey.trim(),
      displayName: mapping.displayName.trim(),
    }));

  return (
    <section aria-labelledby="author-template-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3
            id="author-template-title"
            className="text-lg font-semibold text-gray-950"
          >
            Conditional prompt template
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            Author the canonical-English prompt after the mappings are known. Mapping
            conditions decide which specialized instructions are included when a merchant
            later selects this Store Category.
          </p>
        </div>
        <StoreCategoryAuthoringSectionStatus valid={validation.valid} />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-700">
          Template key
          <input
            className={STORE_CATEGORY_AUTHORING_INPUT_CLASS}
            value={session.defaultTemplate.key}
            maxLength={128}
            onChange={(event) =>
              dispatch({
                type: "template.changed",
                patch: { key: event.target.value },
                now: storeCategoryAuthoringNow(),
              })
            }
            placeholder="fashion_apparel_default"
          />
        </label>

        <label className="text-sm font-medium text-gray-700">
          Display name
          <input
            className={STORE_CATEGORY_AUTHORING_INPUT_CLASS}
            value={session.defaultTemplate.displayName}
            maxLength={255}
            onChange={(event) =>
              dispatch({
                type: "template.changed",
                patch: { displayName: event.target.value },
                now: storeCategoryAuthoringNow(),
              })
            }
            placeholder="Fashion & Apparel default"
          />
        </label>

        <label className="text-sm font-medium text-gray-700 sm:col-span-2">
          Description
          <textarea
            className={STORE_CATEGORY_AUTHORING_INPUT_CLASS}
            value={session.defaultTemplate.description}
            maxLength={2000}
            rows={2}
            onChange={(event) =>
              dispatch({
                type: "template.changed",
                patch: { description: event.target.value },
                now: storeCategoryAuthoringNow(),
              })
            }
          />
        </label>
      </div>

      <div className="mt-5">
        <StoreCategoryPromptConditionEditor
          promptText={session.defaultTemplate.promptText}
          conditions={conditions}
          textareaClassName={`${STORE_CATEGORY_AUTHORING_INPUT_CLASS} min-h-80 font-mono leading-6`}
          onChange={(promptText) =>
            dispatch({
              type: "template.changed",
              patch: { promptText },
              now: storeCategoryAuthoringNow(),
            })
          }
        />
      </div>

      <StoreCategoryAuthoringErrorList issues={validation.issues} />
    </section>
  );
}
