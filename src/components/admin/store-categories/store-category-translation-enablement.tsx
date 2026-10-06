"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { validateStoreCategoryPromptTemplate } from "@modainteract/moda-interact-shared/commerce";
import { MODA_SUPPORTED_LANGUAGE_TAGS } from "@modainteract/moda-interact-shared/internationalization";
import { requestStoreCategoryTranslationAction } from "@/app/actions/store-categories";
import type { StoreCategoryCatalogue } from "@/lib/admin/store-categories";
import type { TranslationConfigurationAdminData } from "@/lib/admin/translation-configuration";

type Category = StoreCategoryCatalogue["categories"][number];

const ACTIVE_STATUSES = new Set(["PENDING", "PROCESSING", "READY_TO_PUBLISH"]);

function completedLocaleCount(category: Category): number {
  const run = category.translationRuns[0];
  if (!run) return 0;
  const byLocale = new Map<string, string[]>();
  for (const item of run.items) {
    const statuses = byLocale.get(item.targetLanguageTag) ?? [];
    statuses.push(item.status);
    byLocale.set(item.targetLanguageTag, statuses);
  }
  let completed = 0;
  for (const locale of MODA_SUPPORTED_LANGUAGE_TAGS) {
    const statuses = byLocale.get(locale) ?? [];
    if (statuses.length > 0 && statuses.every((status) => status === "AVAILABLE")) {
      completed += 1;
    }
  }
  return completed;
}

export function StoreCategoryTranslationEnablement({
  category,
  translationConfiguration,
  canManage,
}: {
  category: Category;
  translationConfiguration: TranslationConfigurationAdminData;
  canManage: boolean;
}) {
  const router = useRouter();
  const inFlight = useRef(false);
  const enabledModels = translationConfiguration.models.filter((model) => model.enabled);
  const [modelId, setModelId] = useState(enabledModels[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRun = category.translationRuns[0];
  const activeRun = Boolean(latestRun && ACTIVE_STATUSES.has(latestRun.status));
  const completeLocales = completedLocaleCount(category);

  const mappingConditionKeys = category.taxonomyMappings.flatMap((mapping) =>
    mapping.conditionKey ? [mapping.conditionKey] : [],
  );
  const mappingsComplete = category.taxonomyMappings.every(
    (mapping) => Boolean(mapping.conditionKey && mapping.displayName?.trim()),
  );
  const template = category.defaultTemplate;
  const promptValidation = useMemo(
    () =>
      template
        ? validateStoreCategoryPromptTemplate({
            source: template.promptText,
            availableConditionKeys: mappingConditionKeys,
          })
        : null,
    [mappingConditionKeys, template],
  );
  const templateReady = Boolean(
    template?.enabled && template.promptText.trim() && promptValidation?.valid,
  );
  const credentialReady = translationConfiguration.credential.configured;
  const modelReady = enabledModels.length > 0;
  const readyToRequest =
    !category.enabled &&
    mappingsComplete &&
    templateReady &&
    credentialReady &&
    modelReady &&
    !activeRun;

  async function requestTranslation() {
    if (
      inFlight.current ||
      !readyToRequest ||
      !modelId ||
      !reason.trim() ||
      !canManage
    ) {
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await requestStoreCategoryTranslationAction({
        categoryId: category.id,
        expectedCategoryEditVersion: category.editVersion,
        translationModelConfigurationId: modelId,
        operationId: crypto.randomUUID(),
        reason: reason.trim(),
      });
      if (!result.ok) {
        setError(result.message);
        if (result.refreshRequired) router.refresh();
        return;
      }
      setReason("");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The translation/enablement request could not be created.",
      );
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4" aria-labelledby="category-enable-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 id="category-enable-title" className="text-sm font-semibold text-gray-900">
            Translation &amp; enablement
          </h4>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            A Store Category is saved as a disabled draft. Enabling starts with a durable
            {MODA_SUPPORTED_LANGUAGE_TAGS.length}-locale translation request. Background
            processing will translate the {MODA_SUPPORTED_LANGUAGE_TAGS.length - 1}
            non-English locales and later publish the translations atomically before enabling.
          </p>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${category.enabled ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-700"}`}>
          {category.enabled ? "Enabled" : "Disabled draft"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md bg-white p-3 ring-1 ring-gray-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Mappings</p>
          <p className="mt-1 font-medium text-gray-900">
            {mappingsComplete ? "Ready" : "Needs configuration"}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {category.taxonomyMappings.length} mapping{category.taxonomyMappings.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rounded-md bg-white p-3 ring-1 ring-gray-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Conditional prompt</p>
          <p className="mt-1 font-medium text-gray-900">
            {templateReady ? "Valid" : "Needs configuration"}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {promptValidation?.referencedConditionKeys.length ?? 0} referenced conditions
          </p>
        </div>
        <div className="rounded-md bg-white p-3 ring-1 ring-gray-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Translation runtime</p>
          <p className="mt-1 font-medium text-gray-900">
            {credentialReady && modelReady ? "Ready" : "Not configured"}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {enabledModels.length} enabled model{enabledModels.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rounded-md bg-white p-3 ring-1 ring-gray-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Locales</p>
          <p className="mt-1 font-medium text-gray-900">{completeLocales} / {MODA_SUPPORTED_LANGUAGE_TAGS.length} complete</p>
          <p className="mt-1 text-xs text-gray-500">
            English is staged without an LLM call.
          </p>
        </div>
      </div>

      {latestRun ? (
        <div className="mt-4 rounded-md border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-gray-900">Latest translation run</p>
              <p className="mt-1 text-xs text-gray-500">
                {latestRun.translationModel.displayName} · {latestRun.provider} / {latestRun.providerModelId}
              </p>
            </div>
            <span className="rounded-full bg-gray-100 px-2 py-1 font-mono text-xs font-semibold text-gray-700">
              {latestRun.status}
            </span>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Requested {new Date(latestRun.requestedAt).toLocaleString()} · run {latestRun.id}
          </p>
          {latestRun.failureCode ? (
            <p className="mt-2 text-sm font-medium text-red-700">
              Failure: {latestRun.failureCode}
            </p>
          ) : null}
          {activeRun ? (
            <p className="mt-3 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
              The durable translation request exists.
            </p>
          ) : null}
        </div>
      ) : null}

      {!category.enabled && !activeRun ? (
        <div className="mt-4 rounded-md border border-gray-200 bg-white p-4">
          <h5 className="text-sm font-semibold text-gray-900">Translate &amp; Enable</h5>
          <p className="mt-1 text-sm text-gray-600">
            Select one of the enabled translation models defined under System Controls → Translations.
            This step only stages durable work; it does not call the provider or enable the category yet.
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(14rem,1fr)_minmax(18rem,2fr)_auto] lg:items-end">
            <label className="text-sm font-medium text-gray-700">
              Translation model
              <select
                className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm"
                value={modelId}
                disabled={!canManage || pending || enabledModels.length === 0}
                onChange={(event) => setModelId(event.target.value)}
              >
                {enabledModels.length === 0 ? <option value="">No enabled models</option> : null}
                {enabledModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.displayName} — {model.providerModelId}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-gray-700">
              Audit reason
              <input
                className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm"
                value={reason}
                disabled={!canManage || pending}
                maxLength={1000}
                placeholder="Configuration reviewed and ready for translation"
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canManage || !readyToRequest || !modelId || !reason.trim() || pending}
              onClick={() => void requestTranslation()}
            >
              {pending ? "Creating translation run…" : "Translate & Enable"}
            </button>
          </div>
          {!credentialReady ? (
            <p className="mt-3 text-sm text-amber-800">Configure the OpenAI translation credential first.</p>
          ) : null}
          {!modelReady ? (
            <p className="mt-2 text-sm text-amber-800">Create and enable at least one translation model profile first.</p>
          ) : null}
          {!mappingsComplete ? (
            <p className="mt-2 text-sm text-amber-800">Every mapping needs a merchant display name and condition key.</p>
          ) : null}
          {!templateReady ? (
            <p className="mt-2 text-sm text-amber-800">Choose a valid enabled default conditional prompt template.</p>
          ) : null}
          {error ? (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
