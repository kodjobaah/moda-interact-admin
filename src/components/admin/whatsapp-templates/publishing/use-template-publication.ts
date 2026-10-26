"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { advanceTemplatePublication, comparePublicationLanguage, confirmTemplatePublication,
  eligiblePublicationShops, previewTemplatePublication } from "@/app/actions/whatsapp-template-publication";
import type { LanguageComparison, PublicationPreview, PublicationProgress, PublicationScope } from "@/lib/admin/whatsapp-templates/publishing/types";
import type { ShopOption } from "./publication-scope-selector";

export function useTemplatePublication(definitionId: string, initialProgress: PublicationProgress | null) {
  const [scope, setScopeState] = useState<PublicationScope>({ mode: "all" });
  const [search, setSearch] = useState(""); const [selectionPage, setSelectionPage] = useState(1);
  // Store responses by query key so a changed filter never displays stale shops.
  // Loading is derived rather than set synchronously within a React effect.
  const [shopResponse, setShopResponse] = useState<{
    key: string; options: ShopOption[]; hasNext: boolean; error: string;
  }>({ key: "", options: [], hasNext: false, error: "" });
  const shopQueryKey = JSON.stringify([scope.mode, search, selectionPage]);
  const shopsLoading = scope.mode !== "all" && shopResponse.key !== shopQueryKey;
  const options = scope.mode !== "all" && !shopsLoading ? shopResponse.options : [];
  const shopsHasNext = scope.mode !== "all" && !shopsLoading && shopResponse.hasNext;
  const shopsError = scope.mode !== "all" && !shopsLoading ? shopResponse.error : "";
  const [preview, setPreview] = useState<PublicationPreview | null>(null);
  const [progress, setProgress] = useState<PublicationProgress | null>(initialProgress);
  const [shopId, setShopId] = useState<string | null>(null);
  const [language, setLanguage] = useState("en");
  const [comparisonResponse, setComparisonResponse] = useState<{
    key: string; data: LanguageComparison | null; error: string;
  }>({ key: "", data: null, error: "" });
  const comparisonQueryKey = JSON.stringify([definitionId, scope, shopId, language, preview?.fingerprint, preview?.issuedAt]);
  const showComparison = !!shopId && !!preview && !progress;
  const comparisonLoading = showComparison && comparisonResponse.key !== comparisonQueryKey;
  const comparison = showComparison && !comparisonLoading ? comparisonResponse.data : null;
  const comparisonError = showComparison && !comparisonLoading ? comparisonResponse.error : "";
  // Time is sampled by a handler/timer, not an impure render expression.
  const [clockNowMs, setClockNowMs] = useState(0);
  const [reason, setReason] = useState(""); const [acknowledgeOverrides, setAcknowledgeOverrides] = useState(false);
  const [reviewedImpact, setReviewedImpact] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [autoRun, setAutoRun] = useState(!!initialProgress && initialProgress.status === "IN_PROGRESS");
  const operationKey = useRef<string | null>(null);
  const advancing = useRef(false);
  const setScope = useCallback((next: PublicationScope) => {
    setScopeState(next); setPreview(null); setShopId(null);
    setAcknowledgeOverrides(false); setReviewedImpact(false); setError(""); operationKey.current = null;
  }, []);

  useEffect(() => {
    if (scope.mode === "all") return;
    let cancelled = false;
    void eligiblePublicationShops({ search, page: selectionPage }).then((reply) => {
      if (cancelled) return;
      setShopResponse(reply.ok
        ? { key: shopQueryKey, options: reply.data.shops, hasNext: reply.data.hasNext, error: "" }
        : { key: shopQueryKey, options: [], hasNext: false, error: reply.message });
    }).catch(() => {
      if (!cancelled) setShopResponse({ key: shopQueryKey, options: [], hasNext: false, error: "Could not search shops." });
    });
    return () => { cancelled = true; };
  }, [scope.mode, search, selectionPage, shopQueryKey]);

  useEffect(() => {
    if (!preview) return;
    const timer = window.setInterval(() => setClockNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [preview]);

  const refreshPreview = useCallback(async (page = 1) => {
    setBusy(true); setError(""); setShopId(null);
    try {
      const reply = await previewTemplatePublication({ definitionId, scope, page });
      if (!reply.ok) { setPreview(null); setError(reply.message); return; }
      setPreview(reply.data); setClockNowMs(Date.now());
      setAcknowledgeOverrides(false); setReviewedImpact(false); operationKey.current = null;
    } catch { setError("Could not load publication preview."); }
    finally { setBusy(false); }
  }, [definitionId, scope]);

  useEffect(() => {
    if (!shopId || !preview || progress) return;
    let cancelled = false;
    void comparePublicationLanguage({ definitionId, scope, shopId, languageTag: language }).then((reply) => {
      if (cancelled) return;
      setComparisonResponse(reply.ok
        ? { key: comparisonQueryKey, data: reply.data, error: "" }
        : { key: comparisonQueryKey, data: null, error: reply.message });
    }).catch(() => {
      if (!cancelled) setComparisonResponse({ key: comparisonQueryKey, data: null, error: "Could not compare the selected language." });
    });
    return () => { cancelled = true; };
  }, [definitionId, scope, shopId, language, preview, progress, comparisonQueryKey]);

  const confirm = useCallback(async () => {
    if (!preview || busy || !reviewedImpact) return;
    setBusy(true); setError("");
    try {
      if (!operationKey.current) operationKey.current = crypto.randomUUID();
      const reply = await confirmTemplatePublication({ definitionId, scope,
        previewFingerprint: preview.fingerprint, previewIssuedAt: preview.issuedAt,
        operationKey: operationKey.current, reason, acknowledgeOverrides });
      if (!reply.ok) { setError(reply.message); if (reply.code === "STALE_PREVIEW") setPreview(null); return; }
      setProgress(reply.data); setAutoRun(true); setPreview(null);
      // The operation URL is a resumable bookmark, never a browser-authorised identity.
      const url = new URL(window.location.href); url.searchParams.set("operation", reply.data.operationId);
      window.history.replaceState(window.history.state, "", url.toString());
    } catch { setError("Could not confirm publication."); }
    finally { setBusy(false); }
  }, [preview, busy, definitionId, scope, reason, acknowledgeOverrides, reviewedImpact]);

  const advance = useCallback(async (retryFailed = false) => {
    if (!progress || advancing.current) return;
    advancing.current = true; setBusy(true); setError("");
    try {
      const reply = await advanceTemplatePublication({ operationId: progress.operationId, retryFailed });
      if (!reply.ok) { setError(reply.message); setAutoRun(false); return; }
      if (progress.nextPageCursor === reply.data.nextPageCursor && !retryFailed && reply.data.status === "IN_PROGRESS") setAutoRun(false);
      setProgress(reply.data);
    } catch { setError("Processing was interrupted. Reopen this operation and continue."); setAutoRun(false); }
    finally { advancing.current = false; setBusy(false); }
  }, [progress]);

  useEffect(() => {
    if (!autoRun || !progress || progress.status !== "IN_PROGRESS" || advancing.current) return;
    void advance();
  }, [autoRun, progress, advance]);

  return {
    scope, setScope, options, shopsLoading, shopsError, shopsHasNext,
    search, setSearch: (value: string) => { setSearch(value); setSelectionPage(1); },
    selectionPage, setSelectionPage,
    preview, progress, busy, error, refreshPreview, confirm, advance, clockNowMs,
    shopId, setShopId: (value: string) => { setShopId(value); setLanguage("en"); },
    language, setLanguage, comparison, comparisonLoading, comparisonError,
    reason, setReason, reviewedImpact, setReviewedImpact, acknowledgeOverrides, setAcknowledgeOverrides,
  };
}
