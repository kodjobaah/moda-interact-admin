"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { fetchQueueMonitorSnapshot } from "./queue-monitor.client.ts";
import type { QueueMonitorSnapshot } from "./queue-monitor.types.ts";
import { getInitialRefreshMs, STORAGE_KEY } from "../queue-monitor-refresh.ts";

export type QueueMonitorSummaryState = {
  snapshot: QueueMonitorSnapshot | null;
  error: string | null;
  loading: boolean;
};

type QueueMonitorSummaryAction =
  | { type: "request-started" }
  | { type: "request-succeeded"; snapshot: QueueMonitorSnapshot }
  | { type: "request-failed"; error: string }
  | { type: "request-finished" };

export function reduceQueueMonitorSummary(
  state: QueueMonitorSummaryState,
  action: QueueMonitorSummaryAction,
): QueueMonitorSummaryState {
  switch (action.type) {
    case "request-started":
      return { ...state, loading: true };
    case "request-succeeded":
      return { ...state, snapshot: action.snapshot, error: null };
    case "request-failed":
      return { ...state, error: action.error };
    case "request-finished":
      return { ...state, loading: false };
  }
}

export function createSummaryRequestGate() {
  let inFlight = false;

  return {
    tryAcquire() {
      if (inFlight) return false;
      inFlight = true;
      return true;
    },
    release() {
      inFlight = false;
    },
  };
}

export function isQueueMonitorAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

type UseQueueMonitorSummaryOptions = {
  onSnapshotAccepted: () => void;
  suspendAutoRefresh: boolean;
  unavailableError: string;
};

export function useQueueMonitorSummary({
  onSnapshotAccepted,
  suspendAutoRefresh,
  unavailableError,
}: UseQueueMonitorSummaryOptions) {
  const [refreshMs, setRefreshMs] = useState(getInitialRefreshMs);
  const [state, dispatch] = useReducer(reduceQueueMonitorSummary, {
    snapshot: null,
    error: null,
    loading: true,
  });
  const requestRef = useRef<AbortController | null>(null);
  const requestGateRef = useRef(createSummaryRequestGate());
  const onSnapshotAcceptedRef = useRef(onSnapshotAccepted);

  useEffect(() => {
    onSnapshotAcceptedRef.current = onSnapshotAccepted;
  }, [onSnapshotAccepted]);

  useEffect(() => {
    if (suspendAutoRefresh) requestRef.current?.abort();
  }, [suspendAutoRefresh]);

  const refresh = useCallback(async () => {
    const requestGate = requestGateRef.current;
    if (!requestGate.tryAcquire()) return;

    const controller = new AbortController();
    requestRef.current = controller;
    dispatch({ type: "request-started" });
    let snapshotAccepted = false;

    try {
      const snapshot = await fetchQueueMonitorSnapshot(controller.signal);
      dispatch({ type: "request-succeeded", snapshot });
      snapshotAccepted = true;
    } catch (fetchError) {
      if (!isQueueMonitorAbortError(fetchError)) {
        dispatch({
          type: "request-failed",
          error: unavailableError,
        });
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      requestGate.release();
      dispatch({ type: "request-finished" });
    }

    if (snapshotAccepted) onSnapshotAcceptedRef.current();
  }, [unavailableError]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0);

    return () => {
      window.clearTimeout(initialRefresh);
      requestRef.current?.abort();
    };
  }, [refresh]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(refreshMs));
    if (suspendAutoRefresh || refreshMs === 0) return undefined;
    const timer = window.setInterval(() => void refresh(), refreshMs);
    return () => window.clearInterval(timer);
  }, [refresh, refreshMs, suspendAutoRefresh]);

  return {
    refreshMs,
    setRefreshMs,
    snapshot: state.snapshot,
    error: state.error,
    loading: state.loading,
    refresh,
  };
}