export type QueueJobStatus = "failed" | "active" | "waiting" | "delayed";
export type QueueJobShop = "*" | "__orphan__" | "__unresolved__" | string;
export type QueueJobDirection = "asc" | "desc";
export type QueueJobAttribution = "known" | "identified" | "unresolved" | "orphan";

export type QueueMonitorSnapshot = {
  observedAt: string;
  queues: Array<{
    queueName: string;
    jobNames: string[];
    counts: {
      waiting: number;
      active: number;
      delayed: number;
      failed: number;
      workers: number;
    };
    lastActivity: { event: string; observedAt: string } | null;
  }>;
};

export type QueueJobSnapshot = {
  queueName: string;
  status: QueueJobStatus;
  shop: string;
  page: number;
  limit: number;
  direction: QueueJobDirection;
  hasPrevious: boolean;
  hasNext: boolean;
  knownTotal: number | null;
  scanTruncated: boolean;
  jobs: Array<{
    id: string;
    queueName: string;
    name: string;
    status: QueueJobStatus;
    shop: string | null;
    shopDomain: string | null;
    attribution: QueueJobAttribution;
    attemptsMade: number;
    eventAt: string | null;
    failedReason: string;
  }>;
  facets: {
    shops: Array<{ value: string; label: string }>;
    hasOrphans: boolean;
    hasUnresolved: boolean;
  };
};

export type QueueJobDetail = {
  id: string;
  queueName: string;
  name: string;
  status: QueueJobStatus;
  shop: string | null;
  shopDomain: string | null;
  attribution: QueueJobAttribution;
  attemptsMade: number;
  timestamp: string | null;
  processedOn: string | null;
  finishedOn: string | null;
  failedReason: string;
  stacktrace: string[];
  data: unknown;
};