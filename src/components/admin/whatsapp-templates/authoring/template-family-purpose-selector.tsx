"use client";

import { MERCHANT_PRICING_LOCALES, MERCHANT_PRICING_LOCALE_LABELS } from "@/lib/admin/merchant-pricing-locales";
import type { TemplateAst, RecoveryStage, OfferType, PromotionTarget, WrapperAudience } from "@/lib/admin/whatsapp-templates/authoring/types";

const selectStyle = "w-full rounded-md border border-gray-300 bg-white p-2 text-sm";
export function TemplateFamilyPurposeSelector({ draft, onChange, onFamilyChange }: {
  draft: TemplateAst; onChange: (next: TemplateAst) => void;
  onFamilyChange: (family: TemplateAst["family"]) => void;
}) {
  return <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
    <legend className="px-1 text-base font-semibold text-slate-900">Template setup</legend>
    <label className="block text-sm">Family
      <select aria-label="Template family" className={selectStyle} value={draft.family} onChange={(e) => onFamilyChange(e.target.value as TemplateAst["family"])}>
        <option value="META_RECOVERY">Meta recovery template</option>
        <option value="MODA_CONVERSATION_WRAPPER">Conversation wrapper (internal)</option>
      </select>
    </label>
    <p className="text-xs text-slate-500">Changing family starts a new message structure. Existing unsaved content must be confirmed before it is reset.</p>
    {draft.family === "META_RECOVERY" ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="block text-sm">Recovery stage
        <select aria-label="Recovery stage" className={selectStyle} value={draft.stage} onChange={(e) => onChange({ ...draft, stage: e.target.value as RecoveryStage })}>
          <option value="INITIAL">Initial</option><option value="FOLLOW_UP">Follow-up</option>
        </select>
      </label>
      <label className="block text-sm">Offer variant
        <select aria-label="Offer variant" className={selectStyle} value={draft.offerType} onChange={(e) => {
          const offerType = e.target.value as OfferType;
          onChange({ ...draft, offerType, promotionTarget: offerType === "NO_OFFER" ? undefined : draft.promotionTarget ?? "CHECKOUT" });
        }}>
          <option value="NO_OFFER">No offer</option><option value="CODE_OFFER">Verified code offer</option><option value="AUTOMATIC_OFFER">Verified automatic offer</option>
        </select>
      </label>
      {draft.offerType !== "NO_OFFER" && <label className="block text-sm">Promotion target
        <select aria-label="Promotion target" className={selectStyle} value={draft.promotionTarget ?? "CHECKOUT"}
          onChange={(e) => onChange({ ...draft, promotionTarget: e.target.value as PromotionTarget })}>
          <option value="CHECKOUT">Abandoned checkout</option><option value="ALTERNATIVE_PRODUCT">Different product</option>
        </select>
      </label>}
    </div> : <label className="block text-sm">Wrapper audience
      <select aria-label="Wrapper audience" className={selectStyle} value={draft.audience} onChange={(e) => onChange({ ...draft, audience: e.target.value as WrapperAudience })}>
        <option value="SHARED">Shared fallback</option><option value="AI">AI response</option><option value="HUMAN">Human response</option>
      </select>
    </label>}
    <label className="block text-sm">Source language (explicit selection)
      <select aria-label="Source language" className={selectStyle} value={draft.sourceLanguageTag} onChange={() => {}}>
        {MERCHANT_PRICING_LOCALES.map((locale) => <option key={locale} value={locale} disabled={locale !== "en"}>{MERCHANT_PRICING_LOCALE_LABELS[locale]} ({locale}){locale === "en" ? " — source" : " — translation stage"}</option>)}
      </select>
    </label>
    <p className="text-xs text-slate-500">English is the immutable source. Other languages are handled through a separate translation workflow.</p>
  </fieldset>;
}
