import { Queue } from "bullmq";

import { getQueueMonitorDefinitions } from "./queue-monitor.ts";

const REQUEST_TIMEOUT_MS = 5_000;
const JOB_ID_PATTERN = /^[\x21-\x7e]{1,256}$/;

export class QueueJobRemovalError extends Error {
  readonly code: "invalid" | "not_found" | "conflict" | "unavailable";

  constructor(
    code: "invalid" | "not_found" | "conflict" | "unavailable",
    options?: ErrorOptions,
  ) {
    super(`Queue job removal ${code}`, options);
    this.name = "QueueJobRemovalError";
    this.code = code;
  }
}

type RemovableJob = {
  id?: string;
  name: string;
  getState(): Promise<string>;
  remove(): Promise<boolean | void>;
  opts?: unknown;
  repeatJobKey?: string;
  parentKey?: string;
};

type JobQueue = {
  waitUntilReady(): Promise<unknown>;
  getJob(jobId: string): Promise<RemovableJob | undefined>;
  close(): Promise<unknown>;
};

type RemovalOptions = {
  redisUrl?: string;
  queueFactory?: (queueName: string, redisUrl: string) => JobQueue;
};

async function bounded<T>(task: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new QueueJobRemovalError("unavailable")),
          REQUEST_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Removes one terminally failed job; never acts on waiting/delayed/active jobs or their dependencies. */
export async function removeFailedQueueJob(
  input: { queueName: string; jobId: string; jobName: string },
  options: RemovalOptions = {},
): Promise<void> {
  const definition = getQueueMonitorDefinitions().find(
    (entry) => entry.queueName === input.queueName,
  );
  if (
    !definition ||
    !JOB_ID_PATTERN.test(input.jobId) ||
    !definition.jobNames.includes(input.jobName)
  ) {
    throw new QueueJobRemovalError("invalid");
  }
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  if (!redisUrl) throw new QueueJobRemovalError("unavailable");
  const queue: JobQueue =
    options.queueFactory?.(input.queueName, redisUrl) ??
    new Queue(input.queueName, {
      connection: {
        url: redisUrl,
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: REQUEST_TIMEOUT_MS,
        commandTimeout: REQUEST_TIMEOUT_MS,
      },
    });
  try {
    await bounded(queue.waitUntilReady());
    const job = await bounded(queue.getJob(input.jobId));
    if (!job) throw new QueueJobRemovalError("not_found");
    const repeated =
      job.opts !== null &&
      typeof job.opts === "object" &&
      "repeat" in job.opts &&
      job.opts.repeat != null;
    if (
      job.id !== input.jobId ||
      job.name !== input.jobName ||
      repeated ||
      job.repeatJobKey ||
      job.parentKey
    ) {
      throw new QueueJobRemovalError("conflict");
    }
    // A failed job is terminal; a concurrent retry or state change must not be treated as a failed record.
    if ((await bounded(job.getState())) !== "failed")
      throw new QueueJobRemovalError("conflict");
    const removed = await bounded(job.remove());
    if (removed === false) throw new QueueJobRemovalError("conflict");
  } catch (error) {
    if (error instanceof QueueJobRemovalError) throw error;
    throw new QueueJobRemovalError("unavailable", { cause: error });
  } finally {
    await queue.close();
  }
}
