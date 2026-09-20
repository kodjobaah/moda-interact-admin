import { Queue } from "bullmq";
import {
  parseShopifyDiscountSyncJob,
  SHOPIFY_WEBHOOK_QUEUE_CONTRACTS,
  type ShopifyDiscountSyncJob,
} from "@modainteract/moda-interact-shared/shopify";
import { createShopifyDiscountSyncJobId } from "@modainteract/moda-interact-shared/shopify/node";

const QUEUE_OPERATION_TIMEOUT_MS = 2_500;

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), QUEUE_OPERATION_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function enqueueAdminShopifyDiscountSync(input: {
  shopId: string;
  shopDomain: string;
  requestedAt?: Date;
}): Promise<{ jobId: string; requestedAt: Date }> {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    throw new Error("Shopify discount sync is unavailable because REDIS_URL is not configured.");
  }

  const requestedAt = input.requestedAt ?? new Date();
  const payload: ShopifyDiscountSyncJob = parseShopifyDiscountSyncJob({
    schemaVersion: 1,
    shopId: input.shopId,
    shopDomain: input.shopDomain,
    reason: "ADMIN_REQUESTED",
    requestedAt: requestedAt.toISOString(),
    deliveryId: null,
    webhookTopic: null,
  });
  const jobId = createShopifyDiscountSyncJobId(payload);
  const queue = new Queue(
    SHOPIFY_WEBHOOK_QUEUE_CONTRACTS.SHOPIFY_DISCOUNT_SYNC.queueName,
    {
      connection: {
        url: redisUrl,
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: QUEUE_OPERATION_TIMEOUT_MS,
        commandTimeout: QUEUE_OPERATION_TIMEOUT_MS,
      },
    },
  );

  try {
    await withTimeout(
      queue.add(
        SHOPIFY_WEBHOOK_QUEUE_CONTRACTS.SHOPIFY_DISCOUNT_SYNC.jobName,
        payload,
        {
          jobId,
          attempts: 3,
          backoff: { type: "exponential", delay: 1_000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      ),
      `Timed out publishing Shopify discount sync job ${jobId}`,
    );
  } finally {
    await queue.close().catch(() => undefined);
  }

  return { jobId, requestedAt };
}
