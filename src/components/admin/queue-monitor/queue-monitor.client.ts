import type {
  QueueJobDetail,
  QueueJobDirection,
  QueueJobShop,
  QueueJobSnapshot,
  QueueJobStatus,
  QueueMonitorSnapshot,
} from "./queue-monitor.types";

type QueueJobsRequest = {
  queue: string;
  status: QueueJobStatus;
  shop: QueueJobShop;
  page: number;
  limit: string;
  direction: QueueJobDirection;
};

type QueueJobDetailRequest = {
  queue: string;
  status: QueueJobStatus;
  jobId: string;
};

export class QueueJobDetailHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Queue job detail request failed with status ${status}`);
    this.name = "QueueJobDetailHttpError";
    this.status = status;
  }
}

async function requestJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { cache: "no-store", signal });
  if (!response.ok) throw new Error("Queue monitor request failed");
  return (await response.json()) as T;
}

export function fetchQueueMonitorSnapshot(
  signal: AbortSignal,
): Promise<QueueMonitorSnapshot> {
  return requestJson("/api/admin/queues", signal);
}

export function fetchQueueJobs(
  request: QueueJobsRequest,
  signal: AbortSignal,
): Promise<QueueJobSnapshot> {
  const params = new URLSearchParams({
    queue: request.queue,
    status: request.status,
    shop: request.shop,
    page: String(request.page),
    limit: String(request.limit),
    direction: request.direction,
  });

  return requestJson(`/api/admin/queues/jobs?${params.toString()}`, signal);
}

export async function fetchQueueJobDetail(
  request: QueueJobDetailRequest,
  signal: AbortSignal,
): Promise<QueueJobDetail> {
  const params = new URLSearchParams({
    queue: request.queue,
    status: request.status,
    jobId: request.jobId,
  });
  const response = await fetch(
    `/api/admin/queues/jobs/detail?${params.toString()}`,
    { cache: "no-store", signal },
  );

  if (!response.ok) throw new QueueJobDetailHttpError(response.status);
  return (await response.json()) as QueueJobDetail;
}