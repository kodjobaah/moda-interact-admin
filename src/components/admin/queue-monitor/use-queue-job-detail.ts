"use client";

import { useEffect, useReducer, useRef } from "react";
import { fetchQueueJobDetail, QueueJobDetailHttpError } from "./queue-monitor.client.ts";
import type { QueueJobDetail, QueueJobStatus } from "./queue-monitor.types.ts";
import type { QueueJobsSelectionInvalidationReason } from "./use-queue-jobs.ts";

export type QueueJobDetailState = {
  selectedJobId: string | null;
  jobDetail: QueueJobDetail | null;
  jobDetailError: string | null;
  jobDetailLoading: boolean;
};

export type QueueJobDetailStateAction =
  | { type: "job-selected"; jobId: string }
  | { type: "selection-cleared" }
  | { type: "selection-invalidated"; reason: QueueJobsSelectionInvalidationReason }
  | { type: "request-succeeded"; detail: QueueJobDetail }
  | { type: "request-failed"; error: string }
  | { type: "request-finished" };

export function createInitialQueueJobDetailState(): QueueJobDetailState {
  return {
    selectedJobId: null,
    jobDetail: null,
    jobDetailError: null,
    jobDetailLoading: false,
  };
}

export function reduceQueueJobDetailState(
  state: QueueJobDetailState,
  action: QueueJobDetailStateAction,
): QueueJobDetailState {
  switch (action.type) {
    case "job-selected":
      return {
        selectedJobId: action.jobId,
        jobDetail: null,
        jobDetailError: null,
        jobDetailLoading: true,
      };
    case "selection-cleared":
      return createInitialQueueJobDetailState();
    case "selection-invalidated":
      return {
        ...state,
        selectedJobId: null,
        jobDetail: null,
        ...(action.reason === "queue-selection" || action.reason === "jobs-replaced"
          ? { jobDetailError: null, jobDetailLoading: false }
          : {}),
      };
    case "request-succeeded":
      return { ...state, jobDetail: action.detail, jobDetailError: null };
    case "request-failed":
      return { ...state, jobDetail: null, jobDetailError: action.error };
    case "request-finished":
      return { ...state, jobDetailLoading: false };
  }
}

export function isQueueJobDetailAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function getQueueJobDetailError(
  error: unknown,
  jobGoneError: string,
  unavailableError: string,
): string | null {
  if (isQueueJobDetailAbort(error)) return null;
  if (error instanceof QueueJobDetailHttpError) {
    return error.status === 404 ? jobGoneError : unavailableError;
  }
  return error instanceof Error ? error.message : unavailableError;
}

type UseQueueJobDetailOptions = {
  selectedQueueName: string | null;
  status: QueueJobStatus;
  jobGoneError: string;
  unavailableError: string;
};

export function useQueueJobDetail({
  selectedQueueName,
  status,
  jobGoneError,
  unavailableError,
}: UseQueueJobDetailOptions) {
  const [state, dispatch] = useReducer(
    reduceQueueJobDetailState,
    undefined,
    createInitialQueueJobDetailState,
  );
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!selectedQueueName || !state.selectedJobId) {
      requestRef.current?.abort();
      return undefined;
    }

    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    void fetchQueueJobDetail({
      queue: selectedQueueName,
      status,
      jobId: state.selectedJobId,
    }, controller.signal)
      .then((detail) => dispatch({ type: "request-succeeded", detail }))
      .catch((error: unknown) => {
        const message = getQueueJobDetailError(error, jobGoneError, unavailableError);
        if (message !== null) dispatch({ type: "request-failed", error: message });
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
    state.selectedJobId,
    status,
    jobGoneError,
    unavailableError,
  ]);

  function selectJob(jobId: string) {
    dispatch({ type: "job-selected", jobId });
  }

  function clearSelection() {
    requestRef.current?.abort();
    dispatch({ type: "selection-cleared" });
  }

  function invalidateSelection(reason: QueueJobsSelectionInvalidationReason) {
    requestRef.current?.abort();
    dispatch({ type: "selection-invalidated", reason });
  }

  return { ...state, selectJob, clearSelection, invalidateSelection };
}