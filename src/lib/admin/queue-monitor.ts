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

export type QueueMonitorDefinition = {
  queueName: string;
  jobNames: string[];
};

export class QueueMonitorUnavailableError extends Error {
  constructor() {
    super('Queue monitor unavailable');
    this.name = 'QueueMonitorUnavailableError';
  }
}

type QueueReader = {
  toKey: (type: string) => string;
  getJobCounts: (...types: JobType[]) => Promise<Record<string, number>>;
  getWorkersCount: () => Promise<number>;
};

type RedisReader = {
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
];

let cachedRedisUrl: string | undefined;
let cachedQueues: Map<string, QueueReader> | undefined;
let cachedRedis: RedisReader | undefined;

export function getQueueMonitorDefinitions(): QueueMonitorDefinition[] {
  return queueDefinitions.map((definition) => ({
    queueName: definition.queueName,
    jobNames: [...definition.jobNames],
  }));
}

function createQueue(queueName: string, redisUrl: string): QueueReader {
  return new Queue(queueName, {
    connection: {
      url: redisUrl,
      lazyConnect: true,
      enableOfflineQueue: true,
      maxRetriesPerRequest: null,
      connectTimeout: QUEUE_OPERATION_TIMEOUT_MS,
      commandTimeout: QUEUE_OPERATION_TIMEOUT_MS,
    },
    skipWaitingForReady: true,
  });
}

function createRedis(redisUrl: string): RedisReader {
  return new Redis(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: true,
    maxRetriesPerRequest: null,
    connectTimeout: QUEUE_OPERATION_TIMEOUT_MS,
    commandTimeout: QUEUE_OPERATION_TIMEOUT_MS,
  });
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

export async function readQueueMonitorSnapshot(
  options: QueueMonitorOptions = {},
): Promise<QueueMonitorSnapshot> {
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  if (!redisUrl) throw new QueueMonitorUnavailableError();

  try {
    const { queues, redis } = getQueueReaders(redisUrl, options);
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
    throw new QueueMonitorUnavailableError();
  }
}