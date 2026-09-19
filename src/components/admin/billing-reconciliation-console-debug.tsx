"use client";

import { useEffect } from "react";
import { getBillingReconciliationDebugStatusAction } from "@/app/actions/billing-unmapped-subscriptions";

const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_DURATION_MS = 90_000;

export function BillingReconciliationConsoleDebug({
  subscriptionId,
}: {
  subscriptionId: string;
}) {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();

    console.info("[billing-reconciliation] polling started", {
      subscriptionId,
      pollIntervalMs: POLL_INTERVAL_MS,
      maxPollDurationMs: MAX_POLL_DURATION_MS,
    });

    const poll = async () => {
      if (cancelled) return;

      try {
        const status =
          await getBillingReconciliationDebugStatusAction(subscriptionId);

        if (cancelled) return;

        console.info("[billing-reconciliation] status", status);

        if (!status.found) {
          console.warn("[billing-reconciliation] subscription no longer exists", {
            subscriptionId,
          });
          return;
        }

        if (status.status !== "UNMAPPED") {
          console.info("[billing-reconciliation] reconciliation completed", status);
          return;
        }

        if (Date.now() - startedAt >= MAX_POLL_DURATION_MS) {
          console.warn("[billing-reconciliation] polling timed out", status);
          return;
        }

        timer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (error) {
        console.error("[billing-reconciliation] status poll failed", {
          subscriptionId,
          error,
        });
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      console.info("[billing-reconciliation] polling stopped", {
        subscriptionId,
      });
    };
  }, [subscriptionId]);

  return null;
}
