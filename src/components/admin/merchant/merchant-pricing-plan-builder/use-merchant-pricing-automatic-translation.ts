"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getMerchantPricingTranslationStatusAction,
  requestMerchantPricingTranslationAction,
} from "@/app/actions/merchant-pricing-translations";
import type { MerchantPricingBuilderHighlight } from "@/lib/admin/merchant/pricing-builder-payload";
import {
  merchantPricingAutomaticTranslationReady,
  merchantPricingAutomaticTranslationSourceKey,
  merchantPricingAutomaticTranslationTerminal,
  type MerchantPricingAutomaticTranslationRunView,
} from "./merchant-pricing-automatic-translation-state";

const POLL_INTERVAL_MS = 2_500;

type TranslationMessageState = {
  sourceKey: string;
  error: string | null;
  configurationRequired: boolean;
};

export type MerchantPricingAutomaticTranslationController = {
  run: MerchantPricingAutomaticTranslationRunView | null;
  requestPending: boolean;
  error: string | null;
  configurationRequired: boolean;
  ready: boolean;
  retry: () => void;
};

export function useMerchantPricingAutomaticTranslation(input: {
  active: boolean;
  translationsRetained: boolean;
  merchantPricingPlanId: string | null;
  initialRunId: string | null;
  shopifyPlanHandle: string;
  englishDescription: string;
  highlights: MerchantPricingBuilderHighlight[];
}): MerchantPricingAutomaticTranslationController {
  const sourceKey = useMemo(
    () =>
      merchantPricingAutomaticTranslationSourceKey({
        shopifyPlanHandle: input.shopifyPlanHandle,
        englishDescription: input.englishDescription,
        highlights: input.highlights,
      }),
    [input.shopifyPlanHandle, input.englishDescription, input.highlights],
  );
  const [run, setRun] =
    useState<MerchantPricingAutomaticTranslationRunView | null>(null);
  const [runSourceKey, setRunSourceKey] = useState<string | null>(null);
  const [requestPendingSourceKey, setRequestPendingSourceKey] = useState<
    string | null
  >(null);
  const [message, setMessage] = useState<TranslationMessageState>({
    sourceKey: "",
    error: null,
    configurationRequired: false,
  });
  const requestedSourceKeyRef = useRef<string | null>(null);
  const initialRunLoadKeyRef = useRef<string | null>(null);
  const requestInFlightRef = useRef(false);
  const pollInFlightRef = useRef(false);

  const requestRun = useCallback(
    async (force: boolean) => {
      if (
        !input.active ||
        input.translationsRetained ||
        requestInFlightRef.current ||
        (!force && requestedSourceKeyRef.current === sourceKey)
      ) {
        return;
      }
      requestInFlightRef.current = true;
      requestedSourceKeyRef.current = sourceKey;
      setRequestPendingSourceKey(sourceKey);
      setMessage({
        sourceKey,
        error: null,
        configurationRequired: false,
      });
      if (force) {
        setRun(null);
        setRunSourceKey(null);
      }
      try {
        const result = await requestMerchantPricingTranslationAction({
          merchantPricingPlanId: input.merchantPricingPlanId,
          shopifyPlanHandle: input.shopifyPlanHandle,
          englishDescription: input.englishDescription,
          highlights: input.highlights,
        });
        if (!result.ok) {
          setMessage({
            sourceKey,
            error: result.message,
            configurationRequired: result.configurationRequired,
          });
          return;
        }
        setRun(result.run as MerchantPricingAutomaticTranslationRunView);
        setRunSourceKey(sourceKey);
      } catch {
        setMessage({
          sourceKey,
          error:
            "Automatic Merchant Pricing translation could not be started. Retry the request.",
          configurationRequired: false,
        });
      } finally {
        requestInFlightRef.current = false;
        setRequestPendingSourceKey((current) =>
          current === sourceKey ? null : current,
        );
      }
    },
    [
      input.active,
      input.translationsRetained,
      input.merchantPricingPlanId,
      input.shopifyPlanHandle,
      input.englishDescription,
      input.highlights,
      sourceKey,
    ],
  );

  const currentRun =
    !input.translationsRetained && runSourceKey === sourceKey ? run : null;

  useEffect(() => {
    if (
      !input.active ||
      input.translationsRetained ||
      currentRun !== null ||
      !input.initialRunId ||
      requestInFlightRef.current
    ) {
      return;
    }

    const loadKey = `${sourceKey}:${input.initialRunId}`;
    if (initialRunLoadKeyRef.current === loadKey) return;
    initialRunLoadKeyRef.current = loadKey;
    requestedSourceKeyRef.current = sourceKey;

    let cancelled = false;
    void getMerchantPricingTranslationStatusAction(input.initialRunId)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setMessage({
            sourceKey,
            error: result.message,
            configurationRequired: false,
          });
          return;
        }
        setMessage({
          sourceKey,
          error: null,
          configurationRequired: false,
        });
        setRun(result.run as MerchantPricingAutomaticTranslationRunView);
        setRunSourceKey(sourceKey);
      })
      .catch(() => {
        if (!cancelled) {
          setMessage({
            sourceKey,
            error:
              "Automatic Merchant Pricing translation status could not be loaded.",
            configurationRequired: false,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    currentRun,
    input.active,
    input.initialRunId,
    input.translationsRetained,
    sourceKey,
  ]);

  useEffect(() => {
    if (
      !input.active ||
      !currentRun ||
      merchantPricingAutomaticTranslationTerminal(currentRun)
    ) {
      return;
    }
    let cancelled = false;
    const polledSourceKey = sourceKey;
    const timer = window.setInterval(() => {
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      void getMerchantPricingTranslationStatusAction(currentRun.runId)
        .then((result) => {
          if (cancelled) return;
          if (!result.ok) {
            setMessage({
              sourceKey: polledSourceKey,
              error: result.message,
              configurationRequired: false,
            });
            return;
          }
          setMessage({
            sourceKey: polledSourceKey,
            error: null,
            configurationRequired: false,
          });
          setRun(result.run as MerchantPricingAutomaticTranslationRunView);
          setRunSourceKey(polledSourceKey);
        })
        .catch(() => {
          if (!cancelled) {
            setMessage({
              sourceKey: polledSourceKey,
              error:
                "Automatic Merchant Pricing translation status could not be loaded.",
              configurationRequired: false,
            });
          }
        })
        .finally(() => {
          pollInFlightRef.current = false;
        });
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [currentRun, input.active, sourceKey]);

  const retry = useCallback(() => {
    requestedSourceKeyRef.current = null;
    initialRunLoadKeyRef.current = null;
    void requestRun(true);
  }, [requestRun]);

  const currentMessage = message.sourceKey === sourceKey ? message : null;

  return {
    run: currentRun,
    requestPending: requestPendingSourceKey === sourceKey,
    error: currentMessage?.error ?? null,
    configurationRequired: currentMessage?.configurationRequired ?? false,
    ready: merchantPricingAutomaticTranslationReady(currentRun),
    retry,
  };
}
