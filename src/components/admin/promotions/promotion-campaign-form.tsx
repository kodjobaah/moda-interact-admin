"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { mutatePromotionCampaignAction } from "@/app/actions/promotions";
import type { PromotionCampaignRow } from "@/lib/admin/promotions/campaigns";
import {
  PROMOTION_SCOPES,
  type PromotionScope,
} from "@/lib/admin/promotions/validation";
import { PromotionTranslationWorkbook } from "@/components/admin/promotions/promotion-translation-workbook";
import {
  buildPromotionTranslationTemplate,
  NEW_PROMOTION_TRANSLATION_CAMPAIGN_ID,
  type PromotionTranslationParseResult,
} from "@/lib/admin/promotions/translations";

const inputClass =
  "w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)]";

function localDateTime(value?: Date): string {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function PromotionCampaignSubmitButton({
  isUpdate,
  disabled,
}: {
  isUpdate: boolean;
  disabled: boolean;
}) {
  const { pending } = useFormStatus();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wasPendingRef = useRef(false);

  useEffect(() => {
    if (wasPendingRef.current && !pending) {
      const form = buttonRef.current?.form;
      if (form) delete form.dataset.submitting;
    }
    wasPendingRef.current = pending;
  }, [pending]);

  return (
    <button
      ref={buttonRef}
      type="submit"
      disabled={pending || disabled}
      className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending
        ? isUpdate
          ? "Saving…"
          : "Creating…"
        : isUpdate
          ? "Save draft"
          : "Create draft"}
    </button>
  );
}

export function PromotionCampaignForm({
  campaign,
  plans,
  shops,
}: {
  campaign?: PromotionCampaignRow;
  plans: { id: string; name: string; shopifyPlanHandle: string }[];
  shops: { id: string; domain: string }[];
}) {
  const persistedEnglishTitle = campaign?.englishMerchantTitle ?? "";
  const persistedEnglishDescription = campaign?.englishMerchantDescription ?? "";
  const [scope, setScope] = useState<PromotionScope>(
    campaign?.scope ?? "GLOBAL",
  );
  const [name, setName] = useState(campaign?.name ?? "");
  const [merchantTitle, setMerchantTitle] = useState(persistedEnglishTitle);
  const [merchantDescription, setMerchantDescription] = useState(
    persistedEnglishDescription,
  );
  const [translationJson, setTranslationJson] = useState("");
  const [translationResult, setTranslationResult] =
    useState<PromotionTranslationParseResult | null>(null);

  const editable = !campaign || campaign.status === "DRAFT";
  const sourceMatchesPersisted = Boolean(
    campaign &&
      merchantTitle.trim() === persistedEnglishTitle.trim() &&
      merchantDescription.trim() === persistedEnglishDescription.trim(),
  );
  const translationsRetained = Boolean(
    campaign && sourceMatchesPersisted && campaign.translationCount === 20,
  );
  const translationSourceReady = Boolean(
    name.trim() && merchantTitle.trim() && merchantDescription.trim(),
  );
  const translationTemplate = buildPromotionTranslationTemplate({
    campaignId: campaign?.id ?? NEW_PROMOTION_TRANSLATION_CAMPAIGN_ID,
    campaignInternalName: name,
    sourceMerchantTitle: merchantTitle,
    sourceMerchantDescription: merchantDescription,
    translations:
      campaign && sourceMatchesPersisted ? campaign.translations : undefined,
  });
  const uploadedTranslationMatchesCurrent = Boolean(
    translationResult?.valid &&
      translationResult.package &&
      translationResult.package._meta.campaignId ===
        translationTemplate._meta.campaignId &&
      translationResult.package._meta.campaignInternalName ===
        translationTemplate._meta.campaignInternalName &&
      translationResult.package._meta.sourceMerchantTitle ===
        translationTemplate._meta.sourceMerchantTitle &&
      translationResult.package._meta.sourceMerchantDescription ===
        translationTemplate._meta.sourceMerchantDescription,
  );
  const translationsReady =
    translationsRetained || uploadedTranslationMatchesCurrent;
  const validTranslationJson = uploadedTranslationMatchesCurrent
    ? translationJson
    : translationsRetained
      ? JSON.stringify(translationTemplate)
      : "";
  const templateCompleteCount = sourceMatchesPersisted
    ? (campaign?.translationCount ?? 1)
    : translationSourceReady
      ? 1
      : 0;

  return (
    <form
      action={mutatePromotionCampaignAction}
      className="space-y-4"
      onSubmitCapture={(event) => {
        const form = event.currentTarget;
        if (!translationSourceReady || !translationsReady) {
          event.preventDefault();
          return;
        }
        if (form.dataset.submitting === "true") {
          event.preventDefault();
          return;
        }
        form.dataset.submitting = "true";
      }}
    >
      <input
        type="hidden"
        name="intent"
        value={campaign ? "update" : "create"}
      />
      {campaign ? <input type="hidden" name="id" value={campaign.id} /> : null}
      <input type="hidden" name="translationJson" value={validTranslationJson} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-700 sm:col-span-2">
          Internal campaign name
          <input
            className={inputClass}
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            readOnly={!editable}
            required
            maxLength={255}
          />
          <span className="mt-1 block text-xs font-normal text-gray-500">
            Only administrators see this name.
          </span>
        </label>
        <label className="text-sm font-medium text-gray-700 sm:col-span-2">
          English merchant title
          <input
            className={inputClass}
            name="merchantTitle"
            value={merchantTitle}
            onChange={(event) => setMerchantTitle(event.target.value)}
            readOnly={!editable}
            required
            maxLength={255}
          />
        </label>
        <label className="text-sm font-medium text-gray-700 sm:col-span-2">
          English merchant description
          <textarea
            className={inputClass}
            name="merchantDescription"
            value={merchantDescription}
            onChange={(event) => setMerchantDescription(event.target.value)}
            readOnly={!editable}
            rows={3}
            required
            maxLength={10000}
          />
        </label>
        <label className="text-sm font-medium text-gray-700">
          Scope
          <select
            className={inputClass}
            name="scope"
            value={scope}
            onChange={(event) => setScope(event.target.value as PromotionScope)}
            disabled={!editable}
          >
            {PROMOTION_SCOPES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-gray-700">
          Recovery credits
          <input
            className={inputClass}
            name="quantity"
            type="number"
            min="1"
            max="1000000"
            defaultValue={campaign?.quantity ?? 1}
            readOnly={!editable}
            required
          />
        </label>
        <label className="text-sm font-medium text-gray-700">
          Target billing plan
          <select
            className={inputClass}
            name="targetPlanId"
            defaultValue={campaign?.targetPlanId ?? ""}
            disabled={scope !== "PLAN" || !editable}
          >
            <option value="">Select a plan</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} ({plan.shopifyPlanHandle})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-gray-700">
          Target shop
          <select
            className={inputClass}
            name="targetShopId"
            defaultValue={campaign?.targetShopId ?? ""}
            disabled={scope !== "SHOP" || !editable}
          >
            <option value="">Select a shop</option>
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.domain}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-gray-700">
          Starts at
          <input
            className={inputClass}
            name="startsAt"
            type="datetime-local"
            defaultValue={localDateTime(campaign?.startsAt)}
            readOnly={!editable}
            required
          />
        </label>
        <label className="text-sm font-medium text-gray-700">
          Expires at
          <input
            className={inputClass}
            name="expiresAt"
            type="datetime-local"
            defaultValue={localDateTime(campaign?.expiresAt)}
            readOnly={!editable}
            required
          />
        </label>
      </div>
      {editable ? (
        <>
          <PromotionTranslationWorkbook
            completeCount={templateCompleteCount}
            template={translationTemplate}
            translationsRetained={translationsRetained}
            disabled={!translationSourceReady}
            onChange={(rawJson, result) => {
              setTranslationJson(rawJson);
              setTranslationResult(result);
            }}
          />
          {!translationsReady ? (
            <p className="text-sm font-semibold text-amber-700">
              Complete and upload all 20 merchant translations before saving
              this campaign.
            </p>
          ) : null}
          <PromotionCampaignSubmitButton
            isUpdate={Boolean(campaign)}
            disabled={!translationSourceReady || !translationsReady}
          />
        </>
      ) : (
        <p className="text-sm text-gray-600">
          Activated campaign terms are immutable. Create a new campaign for a
          materially different offer.
        </p>
      )}
    </form>
  );
}
