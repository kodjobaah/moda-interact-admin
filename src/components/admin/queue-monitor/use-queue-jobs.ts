"use client";

import { useEffect, useReducer, useRef } from "react";
import { fetchQueueJobs } from "./queue-monitor.client.ts";
import type {
  QueueJobDirection,
  QueueJobShop,
  QueueJobSnapshot,
  QueueJobStatus,
} from "./queue-monitor.types.ts";

export type QueueJobsSelectionInvalidationReason =
  | "queue-selection"
  | "filter-change"
  | "view-all"
  | "jobs-replaced";

export type QueueJobsState = {
  queueJobs: QueueJobSnapshot | null;
  showAllJobs: boolean;
  queueJobPage: number;
  queueJobShop: QueueJobShop;
  queueJobStatus: QueueJobStatus;
  queueJobDirection: QueueJobDirection;
  queueJobsError: string | null;
  queueJobsLoading: boolean;
  refreshGeneration: number;
};

export type QueueJobsStateAction =
  | { type: "queue-selected" }
  | { type: "refresh-requested" }
  | { type: "shop-changed"; shop: QueueJobShop }
  | { type: "status-changed"; status: QueueJobStatus }
  | { type: "direction-changed"; direction: QueueJobDirection }
  | { type: "view-all" }
  | { type: "page-previous" }
  | { type: "page-next" }
  | { type: "request-succeeded"; queueJobs: QueueJobSnapshot }
  | { type: "request-failed"; error: string }
  | { type: "request-finished" };

export function createInitialQueueJobsState(): QueueJobsState {
  return {
    queueJobs: null,
    showAllJobs: false,
    queueJobPage: 1,
    queueJobShop: "*",
    queueJobStatus: "failed",
    queueJobDirection: "desc",
    queueJobsError: null,
    queueJobsLoading: false,
    refreshGeneration: 0,
  };
}

export function reduceQueueJobsState(
  state: QueueJobsState,
  action: QueueJobsStateAction,
): QueueJobsState {
  switch (action.type) {
    case "queue-selected":
      return {
        ...state,
        queueJobs: null,
        showAllJobs: false,
        queueJobPage: 1,
        queueJobsError: null,
        queueJobsLoading: true,
      };
    case "refresh-requested":
      return {
        ...state,
        queueJobsError: null,
        queueJobsLoading: true,
        refreshGeneration: state.refreshGeneration + 1,
      };
    case "shop-changed":
      return {
        ...state,
        queueJobShop: action.shop,
        queueJobPage: 1,
        queueJobsError: null,
        queueJobsLoading: true,
      };
    case "status-changed":
      return {
        ...state,
        queueJobStatus: action.status,
        queueJobPage: 1,
        queueJobsError: null,
        queueJobsLoading: true,
      };
    case "direction-changed":
      return {
        ...state,
        queueJobDirection: action.direction,
        queueJobPage: 1,
        queueJobsError: null,
        queueJobsLoading: true,
      };
    case "view-all":
      return { ...state, showAllJobs: true, queueJobPage: 1 };
    case "page-previous":
      return { ...state, queueJobPage: Math.max(1, state.queueJobPage - 1) };
    case "page-next":
      return { ...state, queueJobPage: state.queueJobPage + 1 };
    case "request-succeeded":
      return { ...state, queueJobs: action.queueJobs };
    case "request-failed":
      return { ...state, queueJobs: null, queueJobsError: action.error };
    case "request-finished":
      return { ...state, queueJobsLoading: false };
  }
}

type UseQueueJobsOptions = {
  selectedQueueName: string | null;
  unavailableError: string;
  onSelectionInvalidated: (
    reason: QueueJobsSelectionInvalidationReason,
  ) => void;
};

export function useQueueJobs({
  selectedQueueName,
  unavailableError,
  onSelectionInvalidated,
}: UseQueueJobsOptions) {
  const [state, dispatch] = useReducer(
    reduceQueueJobsState,
    undefined,
    createInitialQueueJobsState,
  );
  const requestRef = useRef<AbortController | null>(null);
  const onSelectionInvalidatedRef = useRef(onSelectionInvalidated);

  useEffect(() => {
    onSelectionInvalidatedRef.current = onSelectionInvalidated;
  }, [onSelectionInvalidated]);

  useEffect(() => {
    if (!selectedQueueName) return undefined;

    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;

    void fetchQueueJobs(
      {
        queue: selectedQueueName,
        status: state.queueJobStatus,
        shop: state.queueJobShop,
        page: state.queueJobPage,
        limit: state.showAllJobs ? "10" : "5",
        direction: state.queueJobDirection,
      },
      controller.signal,
    )
      .then((queueJobs) => {
        dispatch({ type: "request-succeeded", queueJobs });
        onSelectionInvalidatedRef.current("jobs-replaced");
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          dispatch({ type: "request-failed", error: unavailableError });
        }
      })
      .finally(() => {
        if (requestRef.current === controller) {
          requestRef.current = null;
          dispatch({ type: "request-finished" });
        }
      });

    return () => controller.abort();
  }, [
    selectedQueueName,
    state.queueJobShop,
    state.queueJobStatus,
    state.queueJobDirection,
    state.queueJobPage,
    state.showAllJobs,
    state.refreshGeneration,
    unavailableError,
  ]);

  function prepareForQueueSelection() {
    requestRef.current?.abort();
    dispatch({ type: "queue-selected" });
    onSelectionInvalidatedRef.current("queue-selection");
  }

  function refreshJobs() {
    dispatch({ type: "refresh-requested" });
  }

  function changeShop(shop: QueueJobShop) {
    dispatch({ type: "shop-changed", shop });
    onSelectionInvalidatedRef.current("filter-change");
  }

  function changeStatus(status: QueueJobStatus) {
    dispatch({ type: "status-changed", status });
    onSelectionInvalidatedRef.current("filter-change");
  }

  function changeDirection(direction: QueueJobDirection) {
    dispatch({ type: "direction-changed", direction });
  }

  function viewAll() {
    dispatch({ type: "view-all" });
    onSelectionInvalidatedRef.current("view-all");
  }

  function previousPage() {
    dispatch({ type: "page-previous" });
  }

  function nextPage() {
    dispatch({ type: "page-next" });
  }

  return {
    ...state,
    prepareForQueueSelection,
    refreshJobs,
    changeShop,
    changeStatus,
    changeDirection,
    viewAll,
    previousPage,
    nextPage,
  };
}