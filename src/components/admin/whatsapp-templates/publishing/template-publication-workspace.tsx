"use client";

import type { PublicationProgress } from "@/lib/admin/whatsapp-templates/publishing/types";
import { useTemplatePublication } from "./use-template-publication";
import { PublicationScopeSelector } from "./publication-scope-selector";
import { PublicationEligibilitySummary } from "./publication-eligibility-summary";
import { PublicationImpactList } from "./publication-impact-list";
import { ShopLanguageComparison } from "./shop-language-comparison";
import { PublicationOverrideConfirmation } from "./publication-override-confirmation";
import { PublicationProgressSummary } from "./publication-progress-summary";

/** Composition only. All SQL, fingerprinting and transaction handling lives server-side. */
export function TemplatePublicationWorkspace({ definitionId, initialProgress = null }: {
  definitionId: string; initialProgress?: PublicationProgress | null;
}) {
  const state = useTemplatePublication(definitionId, initialProgress);
  return <div className="min-w-0 max-w-6xl space-y-5">
    {state.error && <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}
    {state.progress ? <PublicationProgressSummary progress={state.progress} busy={state.busy}
      onContinue={() => void state.advance(false)} onRetry={() => void state.advance(true)} /> : <>
      <PublicationScopeSelector scope={state.scope} onChange={state.setScope} options={state.options}
        search={state.search} onSearch={state.setSearch} loading={state.shopsLoading} error={state.shopsError}
        selectionPage={state.selectionPage} onSelectionPage={state.setSelectionPage} hasNext={state.shopsHasNext} />
      <button type="button" disabled={state.busy || state.scope.mode === "one" && !state.scope.shopId ||
        state.scope.mode === "selected" && !state.scope.shopIds.length}
        className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        onClick={() => void state.refreshPreview()}>Review exact publication impact</button>
      {state.preview && <>
        <PublicationEligibilitySummary preview={state.preview} />
        <PublicationImpactList preview={state.preview} selectedShopId={state.shopId} onSelect={state.setShopId}
          onPage={(page) => void state.refreshPreview(page)} busy={state.busy} />
        {state.shopId && <ShopLanguageComparison shopId={state.shopId} language={state.language}
          onLanguage={state.setLanguage} result={state.comparison} loading={state.comparisonLoading} error={state.comparisonError} />}
        <PublicationOverrideConfirmation preview={state.preview} reviewedImpact={state.reviewedImpact}
          onReviewedImpact={state.setReviewedImpact} acknowledgeOverrides={state.acknowledgeOverrides}
          onAcknowledgement={state.setAcknowledgeOverrides} reason={state.reason} onReason={state.setReason}
          busy={state.busy} clockNowMs={state.clockNowMs} onConfirm={() => void state.confirm()} />
      </>}
    </>}
  </div>;
}
