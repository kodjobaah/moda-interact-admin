import { Queue, type JobType } from 'bullmq';
import Redis from 'ioredis';

import { SHOPIFY_WEBHOOK_QUEUE_CONTRACTS } from '@modainteract/moda-interact-shared/shopify';

const QUEUE_OPERATION_TIMEOUT_MS = 2_500;

export type QueueMonitorCounts = {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  workers: number;
};

export type QueueMonitorActivity = {
  event: string;
  observedAt: string;
};

export type QueueMonitorQueue = {
  queueName: string;
  jobNames: string[];
  counts: QueueMonitorCounts;
  lastActivity: QueueMonitorActivity | null;
};

export type QueueMonitorSnapshot = {
  observedAt: string;
  queues: QueueMonitorQueue[];
};

export type FailedJobSort = 'failedAt' | 'attemptsMade' | 'name' | 'id';
export type FailedJobDirection = 'asc' | 'desc';

export type FailedJobSummary = {
  id: string;
  queueName: string;
  name: string;
  attemptsMade: number;
  failedAt: string | null;
  failedReason: string;
};

export type FailedJobSnapshot = {
  queueName: string;
  page: number;
  limit: number;
  sort: FailedJobSort;
  direction: FailedJobDirection;
  jobs: FailedJobSummary[];
};

export type FailedJobDetail = {
  id: string;
  queueName: string;
  name: string;
  state: string;
  attemptsMade: number;
  timestamp: string | null;
  processedOn: string | null;
  finishedOn: string | null;
  failedReason: string;
  stacktrace: string[];
  data: unknown;
};

export type QueueJobDetail = {
  id: string;
  queueName: string;
  name: string;
  status: QueueJobStatus;
  shop: string | null;
  attribution: QueueJobAttribution;
  attemptsMade: number;
  timestamp: string | null;
  processedOn: string | null;
  finishedOn: string | null;
  failedReason: string;
  stacktrace: string[];
  data: unknown;
};

export type QueueJobStatus = 'failed' | 'active' | 'waiting' | 'delayed';
export type QueueJobDirection = 'asc' | 'desc';

export type QueueJobSummary = {
  id: string;
  queueName: string;
  name: string;
  status: QueueJobStatus;
  shop: string | null;
  attribution: QueueJobAttribution;
  attemptsMade: number;
  eventAt: string | null;
  failedReason: string;
};

export type QueueJobAttribution = 'known' | 'unresolved' | 'orphan';

export type QueueJobFacets = {
  shops: Array<{ value: string; label: string }>;
  hasOrphans: boolean;
  hasUnresolved: boolean;
  scanTruncated: boolean;
};

export type QueueJobSnapshot = {
  queueName: string;
  status: QueueJobStatus;
  shop: string;
  page: number;
  limit: number;
  direction: QueueJobDirection;
  jobs: QueueJobSummary[];
  facets: QueueJobFacets;
  hasPrevious: boolean;
  hasNext: boolean;
  knownTotal: number | null;
  scanTruncated: boolean;
};

export type QueueMonitorDefinition = {
  queueName: string;
  jobNames: string[];
  supportedJobNames?: string[];
};

export type QueueOverviewDefinition = {
  queueName: string;
  label: string;
};

export type QueueOverviewQueue = QueueOverviewDefinition & {
  active: number;
};

export type QueueOverviewSnapshot = {
  observedAt: string;
  queues: QueueOverviewQueue[];
};

export class QueueMonitorUnavailableError extends Error {
  constructor() {
    super('Queue monitor unavailable');
    this.name = 'QueueMonitorUnavailableError';
  }
}

export class InvalidFailedJobQueryError extends Error {
  constructor() {
    super('Invalid failed job query');
    this.name = 'InvalidFailedJobQueryError';
  }
}

export class FailedJobNotFoundError extends Error {
  constructor() {
    super('Failed job not found');
    this.name = 'FailedJobNotFoundError';
  }
}

export class QueueJobNotFoundError extends Error {
  constructor() {
    super('Queue job not found');
    this.name = 'QueueJobNotFoundError';
  }
}

export class InvalidQueueJobQueryError extends Error {
  constructor() {
    super('Invalid queue job query');
    this.name = 'InvalidQueueJobQueryError';
  }
}

const MAX_FAILED_JOB_SCAN = 1_000;
const MAX_FAILED_JOB_PAGE = 20;
const MAX_FAILED_JOB_LIMIT = 50;
const DEFAULT_FAILED_JOB_LIMIT = 25;
const MAX_QUEUE_JOB_SCAN = 1_000;
const MAX_QUEUE_JOB_PAGE = 100;
const MAX_QUEUE_JOB_LIMIT = 50;
const DEFAULT_QUEUE_JOB_LIMIT = 10;

type QueueReader = {
  toKey: (type: string) => string;
  waitUntilReady: () => Promise<unknown>;
  getJobCounts: (...types: JobType[]) => Promise<Record<string, number>>;
  getWorkersCount: () => Promise<number>;
  getJobs: (
    types: JobType | JobType[],
    start?: number,
    end?: number,
    asc?: boolean,
  ) => Promise<QueueJob[]>;
  getJob: (jobId: string) => Promise<QueueJob | undefined>;
  getJobState: (jobId: string) => Promise<string>;
};

type QueueJob = {
  id?: string;
  name: string;
  attemptsMade: number;
  data?: unknown;
  timestamp?: number;
  delay?: number;
  processedOn?: number;
  finishedOn?: number;
  failedReason?: string;
  stacktrace?: string[] | null;
};

type RedisReader = {
  waitUntilReady: () => Promise<unknown>;
  xrevrange: (
    key: string,
    end: string,
    start: string,
    countToken: 'COUNT',
    count: string,
  ) => Promise<unknown>;
};

type QueueMonitorOptions = {
  redisUrl?: string;
  now?: () => Date;
  queueFactory?: (queueName: string, redisUrl: string) => QueueReader;
  redisFactory?: (redisUrl: string) => RedisReader;
};

const queueDefinitions: QueueMonitorDefinition[] = [
  {
    queueName: SHOPIFY_WEBHOOK_QUEUE_CONTRACTS.CHECKOUT_EVENTS.queueName,
    jobNames: [
      SHOPIFY_WEBHOOK_QUEUE_CONTRACTS.CHECKOUT_EVENTS.jobName,
      SHOPIFY_WEBHOOK_QUEUE_CONTRACTS.CHECKOUT_UPDATED_EVENTS.jobName,
    ],
  },
  {
    queueName: SHOPIFY_WEBHOOK_QUEUE_CONTRACTS.ORDER_EVENTS.queueName,
    jobNames: [SHOPIFY_WEBHOOK_QUEUE_CONTRACTS.ORDER_EVENTS.jobName],
  },
  {
    queueName: 'pending-recovery-candidates',
    jobNames: ['Pending recovery candidates'],
    supportedJobNames: ['evaluate-pending-recovery'],
  },
  {
    queueName: 'whatsapp-events',
    jobNames: ['WhatsApp events'],
  },
];

const queueOverviewDefinitions: QueueOverviewDefinition[] = [
  {
    queueName: SHOPIFY_WEBHOOK_QUEUE_CONTRACTS.CHECKOUT_EVENTS.queueName,
    label: 'Checkout Events',
  },
  {
    queueName: SHOPIFY_WEBHOOK_QUEUE_CONTRACTS.ORDER_EVENTS.queueName,
    label: 'Order Events',
  },
  {
    queueName: 'pending-recovery-candidates',
    label: 'Pending Recoveries',
  },
  {
    queueName: 'whatsapp-events',
    label: 'WhatsApp Events',
  },
];

let cachedRedisUrl: string | undefined;
let cachedQueues: Map<string, QueueReader> | undefined;
let cachedRedis: RedisReader | undefined;
let cachedOverviewQueueUrl: string | undefined;
let cachedOverviewQueues: Map<string, QueueReader> | undefined;

export function getQueueMonitorDefinitions(): QueueMonitorDefinition[] {
  return queueDefinitions.map((definition) => ({
    queueName: definition.queueName,
    jobNames: [...definition.jobNames],
  }));
}

function getQueueDefinition(queueName: string) {
  return queueDefinitions.find((definition) => definition.queueName === queueName);
}

export function getQueueOverviewDefinitions(): QueueOverviewDefinition[] {
  return queueOverviewDefinitions.map((definition) => ({ ...definition }));
}

function createQueue(queueName: string, redisUrl: string): QueueReader {
  return new Queue(queueName, {
    connection: {
      url: redisUrl,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: QUEUE_OPERATION_TIMEOUT_MS,
      commandTimeout: QUEUE_OPERATION_TIMEOUT_MS,
    },
  });
}

function createRedis(redisUrl: string): RedisReader {
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: QUEUE_OPERATION_TIMEOUT_MS,
    commandTimeout: QUEUE_OPERATION_TIMEOUT_MS,
  });

  return {
    waitUntilReady: async () => {
      if (redis.status === 'ready') return;
      if (redis.status === 'wait' || redis.status === 'end') {
        await redis.connect();
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const onReady = () => {
          cleanup();
          resolve();
        };
        const onError = (error: Error) => {
          cleanup();
          reject(error);
        };
        const cleanup = () => {
          redis.off('ready', onReady);
          redis.off('error', onError);
        };

        redis.once('ready', onReady);
        redis.once('error', onError);
      });
    },
    xrevrange: (...args) => redis.xrevrange(...args),
  };
}

function getQueueReaders(redisUrl: string, options: QueueMonitorOptions) {
  if (cachedQueues && cachedRedis && cachedRedisUrl === redisUrl) {
    return { queues: cachedQueues, redis: cachedRedis };
  }

  cachedQueues = new Map(
    queueDefinitions.map((definition) => [
      definition.queueName,
      options.queueFactory?.(definition.queueName, redisUrl) ?? createQueue(definition.queueName, redisUrl),
    ]),
  );
  cachedRedis = options.redisFactory?.(redisUrl) ?? createRedis(redisUrl);
  cachedRedisUrl = redisUrl;
  return { queues: cachedQueues, redis: cachedRedis };
}

function clearQueueReaders(redisUrl: string) {
  if (cachedRedisUrl !== redisUrl) return;
  cachedQueues = undefined;
  cachedRedis = undefined;
  cachedRedisUrl = undefined;
}

function getOverviewQueueReaders(redisUrl: string, options: QueueMonitorOptions) {
  if (cachedOverviewQueues && cachedOverviewQueueUrl === redisUrl) {
    return { queues: cachedOverviewQueues };
  }

  cachedOverviewQueues = new Map(
    queueOverviewDefinitions.map((definition) => [
      definition.queueName,
      options.queueFactory?.(definition.queueName, redisUrl) ?? createQueue(definition.queueName, redisUrl),
    ]),
  );
  cachedOverviewQueueUrl = redisUrl;
  return { queues: cachedOverviewQueues };
}

function withTimeout<T>(operation: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new QueueMonitorUnavailableError()), QUEUE_OPERATION_TIMEOUT_MS);
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function parseLatestActivity(result: unknown): QueueMonitorActivity | null {
  if (!Array.isArray(result) || result.length === 0 || !Array.isArray(result[0])) return null;
  const entry = result[0] as [unknown, unknown];
  const id = typeof entry[0] === 'string' ? entry[0] : '';
  const fields = Array.isArray(entry[1]) ? entry[1] : [];
  const eventIndex = fields.findIndex((field) => field === 'event');
  const event = eventIndex >= 0 && typeof fields[eventIndex + 1] === 'string'
    ? fields[eventIndex + 1]
    : null;
  const timestamp = Number(id.split('-')[0]);

  if (!event || !Number.isFinite(timestamp)) return null;
  return { event, observedAt: new Date(timestamp).toISOString() };
}

async function readLatestActivity(queue: QueueReader, redis: RedisReader) {
  const result = await withTimeout(redis.xrevrange(queue.toKey('events'), '+', '-', 'COUNT', '1'));
  return parseLatestActivity(result);
}

async function readQueue(queue: QueueReader, definition: QueueMonitorDefinition, redis: RedisReader) {
  const [counts, workers, lastActivity] = await withTimeout(Promise.all([
    queue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
    queue.getWorkersCount(),
    readLatestActivity(queue, redis),
  ]));

  return {
    queueName: definition.queueName,
    jobNames: [...definition.jobNames],
    counts: {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
      workers,
    },
    lastActivity,
  };
}

function parsePositiveInteger(value: string | undefined, fallback: number, maximum: number) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) throw new InvalidFailedJobQueryError();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new InvalidFailedJobQueryError();
  }
  return parsed;
}

function normalizeTimestamp(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value).toISOString()
    : null;
}

function normalizeShopValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0 || normalized.length > 253) return null;
  const labels = normalized.split('.');
  if (labels.length < 2 || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
    return null;
  }
  return normalized;
}

function isWhatsAppQueue(queueName: string) {
  return queueName === 'whatsapp-events';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function extractQueueJobShop(
  queueName: string,
  jobName: string,
  data: unknown,
): string | null {
  const isShopifyQueue =
    queueName === SHOPIFY_WEBHOOK_QUEUE_CONTRACTS.CHECKOUT_EVENTS.queueName ||
    queueName === SHOPIFY_WEBHOOK_QUEUE_CONTRACTS.ORDER_EVENTS.queueName;
  if (!isRecord(data)) return null;

  const definition = getQueueDefinition(queueName);
  const supportedJobNames = definition?.supportedJobNames ?? definition?.jobNames ?? [];
  if (!supportedJobNames.includes(jobName)) return null;
  if (isShopifyQueue) {
    if (!isRecord(data.tenant)) return null;
    return normalizeShopValue(data.tenant.shopDomain);
  }
  if (queueName === 'pending-recovery-candidates') {
    return normalizeShopValue(data.shopDomain);
  }
  return null;
}

function classifyQueueJob(
  queueName: string,
  jobName: string,
  data: unknown,
): { shop: string | null; attribution: QueueJobAttribution } {
  const shop = extractQueueJobShop(queueName, jobName, data);
  if (shop) return { shop, attribution: 'known' };
  return {
    shop: null,
    attribution: isWhatsAppQueue(queueName) ? 'unresolved' : 'orphan',
  };
}

function parseFailedJobSort(value: string | undefined): FailedJobSort {
  if (!value) return 'failedAt';
  if (value === 'failedAt' || value === 'attemptsMade' || value === 'name' || value === 'id') return value;
  throw new InvalidFailedJobQueryError();
}

function parseFailedJobDirection(value: string | undefined): FailedJobDirection {
  if (!value) return 'desc';
  if (value === 'asc' || value === 'desc') return value;
  throw new InvalidFailedJobQueryError();
}

function parseQueueJobStatus(value: string | undefined): QueueJobStatus {
  if (value === undefined || value === 'failed') return 'failed';
  if (value === 'active' || value === 'waiting' || value === 'delayed') return value;
  throw new InvalidQueueJobQueryError();
}

function parseRequiredQueueJobStatus(value: string | undefined): QueueJobStatus {
  if (value === undefined) throw new InvalidQueueJobQueryError();
  return parseQueueJobStatus(value);
}

function parseQueueJobDirection(value: string | undefined): QueueJobDirection {
  if (value === undefined || value === 'desc') return 'desc';
  if (value === 'asc') return 'asc';
  throw new InvalidQueueJobQueryError();
}

function parseQueueJobShop(value: string | undefined): string {
  if (value === undefined || value === '*') return '*';
  if (value === '__orphan__' || value === '__unresolved__') return value;
  const normalized = normalizeShopValue(value);
  if (!normalized) throw new InvalidQueueJobQueryError();
  return normalized;
}

function parseQueueJobPositiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) throw new InvalidQueueJobQueryError();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new InvalidQueueJobQueryError();
  }
  return parsed;
}

function queueJobEventAt(job: QueueJob, status: QueueJobStatus) {
  if (status === 'failed') {
    return normalizeTimestamp(job.finishedOn)
      ?? normalizeTimestamp(job.processedOn)
      ?? normalizeTimestamp(job.timestamp);
  }
  if (status === 'active') {
    return normalizeTimestamp(job.processedOn) ?? normalizeTimestamp(job.timestamp);
  }
  if (status === 'delayed') {
    return normalizeTimestamp((job.timestamp ?? 0) + Math.max(job.delay ?? 0, 0));
  }
  return normalizeTimestamp(job.timestamp);
}

function toQueueJobSummary(
  queueName: string,
  status: QueueJobStatus,
  job: QueueJob,
): QueueJobSummary {
  const attribution = classifyQueueJob(queueName, job.name, job.data);
  return {
    id: job.id ?? '',
    queueName,
    name: job.name,
    status,
    ...attribution,
    attemptsMade: job.attemptsMade,
    eventAt: queueJobEventAt(job, status),
    failedReason: status === 'failed' ? job.failedReason ?? '' : '',
  };
}

function matchesQueueJobShop(job: QueueJobSummary, filter: string) {
  if (filter === '*') return true;
  if (filter === '__orphan__') return job.attribution === 'orphan';
  if (filter === '__unresolved__') return job.attribution === 'unresolved';
  return job.shop === filter;
}

function compareQueueJobs(left: QueueJobSummary, right: QueueJobSummary, direction: QueueJobDirection) {
  const eventResult = (left.eventAt ?? '').localeCompare(right.eventAt ?? '');
  const result = eventResult === 0 ? left.id.localeCompare(right.id) : eventResult;
  return direction === 'asc' ? result : result * -1;
}

function buildQueueJobFacets(
  summaries: QueueJobSummary[],
  scanTruncated: boolean,
): QueueJobFacets {
  const shops = [...new Set(summaries.flatMap((job) => job.shop ? [job.shop] : []))]
    .sort((left, right) => left.localeCompare(right))
    .map((value) => ({ value, label: value }));
  return {
    shops,
    hasOrphans: summaries.some((job) => job.attribution === 'orphan'),
    hasUnresolved: summaries.some((job) => job.attribution === 'unresolved'),
    scanTruncated,
  };
}

function compareFailedJobs(left: FailedJobSummary, right: FailedJobSummary, sort: FailedJobSort) {
  if (sort === 'attemptsMade') return left.attemptsMade - right.attemptsMade;
  if (sort === 'failedAt') return (left.failedAt ?? '').localeCompare(right.failedAt ?? '');
  return left[sort].localeCompare(right[sort]);
}

export async function readFailedJobSnapshot(
  options: QueueMonitorOptions & {
    queueName?: string;
    page?: string;
    limit?: string;
    sort?: string;
    direction?: string;
  } = {},
): Promise<FailedJobSnapshot> {
  const queueName = options.queueName;
  const definition = queueName ? getQueueDefinition(queueName) : undefined;
  if (!definition) throw new InvalidFailedJobQueryError();

  const page = parsePositiveInteger(options.page, 1, MAX_FAILED_JOB_PAGE);
  const limit = parsePositiveInteger(options.limit, DEFAULT_FAILED_JOB_LIMIT, MAX_FAILED_JOB_LIMIT);
  const sort = parseFailedJobSort(options.sort);
  const direction = parseFailedJobDirection(options.direction);
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  if (!redisUrl) throw new QueueMonitorUnavailableError();

  try {
    const { queues } = getQueueReaders(redisUrl, options);
    const queue = queues.get(definition.queueName);
    if (!queue) throw new QueueMonitorUnavailableError();
    await withTimeout(queue.waitUntilReady());
    const jobs = await withTimeout(queue.getJobs('failed', 0, MAX_FAILED_JOB_SCAN - 1, false));
    const summaries = jobs.map((job) => ({
      id: job.id ?? '',
      queueName: definition.queueName,
      name: job.name,
      attemptsMade: job.attemptsMade,
      failedAt: typeof job.finishedOn === 'number' ? new Date(job.finishedOn).toISOString() : null,
      failedReason: job.failedReason ?? '',
    }));
    const multiplier = direction === 'asc' ? 1 : -1;
    summaries.sort((left, right) => {
      const result = compareFailedJobs(left, right, sort);
      return result === 0 ? left.id.localeCompare(right.id) : result * multiplier;
    });
    const start = (page - 1) * limit;
    return {
      queueName: definition.queueName,
      page,
      limit,
      sort,
      direction,
      jobs: summaries.slice(start, start + limit),
    };
  } catch (error) {
    if (error instanceof InvalidFailedJobQueryError) throw error;
    throw new QueueMonitorUnavailableError();
  }
}

export async function readQueueJobSnapshot(
  options: QueueMonitorOptions & {
    queueName?: string;
    status?: string;
    shop?: string;
    page?: string;
    limit?: string;
    direction?: string;
  } = {},
): Promise<QueueJobSnapshot> {
  const queueName = options.queueName;
  const definition = queueName ? getQueueDefinition(queueName) : undefined;
  if (!definition) throw new InvalidQueueJobQueryError();

  const status = parseQueueJobStatus(options.status);
  const shop = parseQueueJobShop(options.shop);
  const page = parseQueueJobPositiveInteger(options.page, 1, MAX_QUEUE_JOB_PAGE);
  const limit = parseQueueJobPositiveInteger(options.limit, DEFAULT_QUEUE_JOB_LIMIT, MAX_QUEUE_JOB_LIMIT);
  const direction = parseQueueJobDirection(options.direction);
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  if (!redisUrl) throw new QueueMonitorUnavailableError();

  try {
    const { queues } = getQueueReaders(redisUrl, options);
    const queue = queues.get(definition.queueName);
    if (!queue) throw new QueueMonitorUnavailableError();
    await withTimeout(queue.waitUntilReady());

    const otherStatuses = (['failed', 'active', 'waiting', 'delayed'] as QueueJobStatus[])
      .filter((candidate) => candidate !== status);
    const [selectedScan, ...facetScans] = await withTimeout(Promise.all([
      queue.getJobs(status, 0, MAX_QUEUE_JOB_SCAN - 1, false),
      ...otherStatuses.map((candidate) =>
        queue.getJobs(candidate, 0, MAX_QUEUE_JOB_SCAN - 1, false),
      ),
    ]));
    const selectedSummaries = selectedScan.map((job) =>
      toQueueJobSummary(definition.queueName, status, job),
    );
    const facetSummaries = [
      ...selectedSummaries,
      ...facetScans.flatMap((jobs, index) =>
        jobs.map((job) =>
          toQueueJobSummary(definition.queueName, otherStatuses[index], job),
        ),
      ),
    ];
    const filtered = selectedSummaries
      .filter((job) => matchesQueueJobShop(job, shop))
      .sort((left, right) => compareQueueJobs(left, right, direction));
    const start = (page - 1) * limit;
    const end = start + limit;
    const listScanTruncated = selectedScan.length >= MAX_QUEUE_JOB_SCAN;

    return {
      queueName: definition.queueName,
      status,
      shop,
      page,
      limit,
      direction,
      jobs: filtered.slice(start, end),
      facets: buildQueueJobFacets(
        facetSummaries,
        selectedScan.length >= MAX_QUEUE_JOB_SCAN ||
          facetScans.some((jobs) => jobs.length >= MAX_QUEUE_JOB_SCAN),
      ),
      hasPrevious: page > 1,
      hasNext: listScanTruncated || end < filtered.length,
      knownTotal: listScanTruncated ? null : filtered.length,
      scanTruncated: listScanTruncated,
    };
  } catch (error) {
    if (error instanceof InvalidQueueJobQueryError) throw error;
    throw new QueueMonitorUnavailableError();
  }
}

export async function readQueueJobDetail(
  options: QueueMonitorOptions & {
    queueName?: string;
    status?: string;
    jobId?: string;
  } = {},
): Promise<QueueJobDetail> {
  const queueName = options.queueName;
  const definition = queueName ? getQueueDefinition(queueName) : undefined;
  const jobId = options.jobId;
  if (!definition || !jobId || jobId.length > 256) {
    throw new InvalidQueueJobQueryError();
  }
  const status = parseRequiredQueueJobStatus(options.status);
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  if (!redisUrl) throw new QueueMonitorUnavailableError();

  try {
    const { queues } = getQueueReaders(redisUrl, options);
    const queue = queues.get(definition.queueName);
    if (!queue) throw new QueueMonitorUnavailableError();
    await withTimeout(queue.waitUntilReady());
    const [job, state] = await withTimeout(Promise.all([
      queue.getJob(jobId),
      queue.getJobState(jobId),
    ]));
    if (!job || state !== status) throw new QueueJobNotFoundError();

    const attribution = classifyQueueJob(definition.queueName, job.name, job.data);
    return {
      id: job.id ?? jobId,
      queueName: definition.queueName,
      name: job.name,
      status,
      ...attribution,
      attemptsMade: job.attemptsMade,
      timestamp: normalizeTimestamp(job.timestamp),
      processedOn: normalizeTimestamp(job.processedOn),
      finishedOn: normalizeTimestamp(job.finishedOn),
      failedReason: status === 'failed' ? job.failedReason ?? '' : '',
      stacktrace: Array.isArray(job.stacktrace) ? [...job.stacktrace] : [],
      data: job.data ?? null,
    };
  } catch (error) {
    if (error instanceof InvalidQueueJobQueryError || error instanceof QueueJobNotFoundError) {
      throw error;
    }
    throw new QueueMonitorUnavailableError();
  }
}

export async function readFailedJobDetail(
  options: QueueMonitorOptions & { queueName?: string; jobId?: string } = {},
): Promise<FailedJobDetail> {
  const queueName = options.queueName;
  const definition = queueName ? getQueueDefinition(queueName) : undefined;
  const jobId = options.jobId;
  if (!definition || !jobId || jobId.length > 256) {
    throw new InvalidFailedJobQueryError();
  }

  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  if (!redisUrl) throw new QueueMonitorUnavailableError();

  try {
    const { queues } = getQueueReaders(redisUrl, options);
    const queue = queues.get(definition.queueName);
    if (!queue) throw new QueueMonitorUnavailableError();
    await withTimeout(queue.waitUntilReady());
    const [job, state] = await withTimeout(Promise.all([
      queue.getJob(jobId),
      queue.getJobState(jobId),
    ]));
    if (!job || state !== 'failed') throw new FailedJobNotFoundError();

    return {
      id: job.id ?? jobId,
      queueName: definition.queueName,
      name: job.name,
      state,
      attemptsMade: job.attemptsMade,
      timestamp: normalizeTimestamp(job.timestamp),
      processedOn: normalizeTimestamp(job.processedOn),
      finishedOn: normalizeTimestamp(job.finishedOn),
      failedReason: job.failedReason ?? '',
      stacktrace: Array.isArray(job.stacktrace) ? [...job.stacktrace] : [],
      data: job.data ?? null,
    };
  } catch (error) {
    if (error instanceof InvalidFailedJobQueryError || error instanceof FailedJobNotFoundError) {
      throw error;
    }
    throw new QueueMonitorUnavailableError();
  }
}

export async function readQueueMonitorSnapshot(
  options: QueueMonitorOptions = {},
): Promise<QueueMonitorSnapshot> {
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  if (!redisUrl) throw new QueueMonitorUnavailableError();

  try {
    const { queues, redis } = getQueueReaders(redisUrl, options);
    await withTimeout(Promise.all([
      redis.waitUntilReady(),
      ...queueDefinitions.map((definition) => {
        const queue = queues.get(definition.queueName);
        if (!queue) throw new QueueMonitorUnavailableError();
        return queue.waitUntilReady();
      }),
    ]));
    const queuesSnapshot = await Promise.all(
      queueDefinitions.map((definition) => {
        const queue = queues.get(definition.queueName);
        if (!queue) throw new QueueMonitorUnavailableError();
        return readQueue(queue, definition, redis);
      }),
    );
    return {
      observedAt: (options.now ?? (() => new Date()))().toISOString(),
      queues: queuesSnapshot,
    };
  } catch {
    clearQueueReaders(redisUrl);
    throw new QueueMonitorUnavailableError();
  }
}

export async function readQueueOverviewSnapshot(
  options: QueueMonitorOptions = {},
): Promise<QueueOverviewSnapshot> {
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  if (!redisUrl) throw new QueueMonitorUnavailableError();

  try {
    const { queues } = getOverviewQueueReaders(redisUrl, options);
    const overview = await withTimeout(Promise.all(
      queueOverviewDefinitions.map(async (definition) => {
        const queue = queues.get(definition.queueName);
        if (!queue) throw new QueueMonitorUnavailableError();
        await withTimeout(queue.waitUntilReady());
        const counts = await queue.getJobCounts('active');
        return {
          ...definition,
          active: counts.active ?? 0,
        };
      }),
    ));

    return {
      observedAt: (options.now ?? (() => new Date()))().toISOString(),
      queues: overview,
    };
  } catch {
    throw new QueueMonitorUnavailableError();
  }
}