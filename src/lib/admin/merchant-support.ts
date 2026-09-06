import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import {
  AuthoredSupportBodySchema,
  MERCHANT_COMMUNICATIONS_JOB_NAMES,
  MERCHANT_COMMUNICATIONS_QUEUE_NAME,
  MERCHANT_COMMUNICATIONS_SCHEMA_VERSION,
  PLATFORM_SUPPORT_LANGUAGE_TAG,
  requiresMerchantTranslation,
} from '@modainteract/moda-interact-shared/merchant-communications';
import { LanguageTagSchema } from '@modainteract/moda-interact-shared/internationalization';
import {
  createTranslationDispatchJobId,
  createTranslationReconcileJobId,
} from '@modainteract/moda-interact-shared/merchant-communications/node';
import { Queue } from 'bullmq';

import {
  requirePlatformAdminMutation,
  requirePlatformAdminRead,
  type PlatformAdminPrincipal,
} from '../auth/platform-admin.ts';
import { logAdminSecurityEvent } from '../auth/audit.ts';
import { prisma } from '../prisma.ts';

const MAX_PAGE_SIZE = 50;
const MAX_THREAD_MESSAGES = 100;

type SupportQueue = Pick<Queue, 'add'>;

type ThreadRow = {
  id: string;
  shopId: string;
  domain: string;
  assignedPlatformAdminId: string | null;
  needsAdminResponse: boolean;
  lastMessageAt: Date | null;
  lastMerchantMessageAt: Date | null;
  messageCount: number;
};

type MessageRow = {
  id: string;
  kind: string;
  state: string;
  originalBody: string;
  sourceLanguageTag: string;
  displayLanguageTag: string | null;
  translatedBody: string | null;
  translationStatus: string | null;
  createdAt: Date;
  readAt: Date | null;
};

type TransactionClient = {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
  $executeRaw(query: Prisma.Sql): Promise<number>;
};

type DatabaseClient = {
  $transaction<T>(callback: (transaction: TransactionClient) => Promise<T>): Promise<T>;
  $executeRaw(query: Prisma.Sql): Promise<number>;
};

type SupportQueueData = Record<string, unknown>;

let redisQueue: Queue | null = null;
let redisQueueUrl: string | null = null;

function pageSize(value: number): number {
  return Math.min(Math.max(Math.trunc(value), 1), MAX_PAGE_SIZE);
}

function pageNumber(value: number): number {
  return Math.max(Math.trunc(value), 1);
}

function languageBase(languageTag: string): string {
  return new Intl.Locale(languageTag).language;
}

function targetLanguage(defaultLanguageTag: string | null): string {
  const value = defaultLanguageTag?.trim();
  if (!value) return PLATFORM_SUPPORT_LANGUAGE_TAG;
  return new Intl.Locale(value).toString();
}

export async function getMerchantCommunicationsQueue(): Promise<SupportQueue | null> {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) return null;
  if (redisQueue && redisQueueUrl === redisUrl) return redisQueue;
  if (redisQueue) {
    await redisQueue.close();
  }
  redisQueueUrl = redisUrl;
  redisQueue = new Queue(MERCHANT_COMMUNICATIONS_QUEUE_NAME, {
    connection: {
      url: redisUrl,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 2_500,
      commandTimeout: 2_500,
    },
  });
  return redisQueue;
}

async function enqueueBestEffort(
  name: string,
  data: SupportQueueData,
  jobId: string,
  queue: SupportQueue | null,
): Promise<void> {
  if (!queue) return;
  try {
    await queue.add(name, data, { jobId });
  } catch {
    logAdminSecurityEvent('admin.support.enqueue_failed', {
      action: 'enqueue_support_work',
      resourceType: 'merchant_support',
      outcome: 'failed',
      reasonCode: 'redis_unavailable',
    });
  }
}

async function enqueueDispatchBestEffort(
  translationId: string,
  queue: SupportQueue | null,
): Promise<void> {
  await enqueueBestEffort(
    MERCHANT_COMMUNICATIONS_JOB_NAMES.TRANSLATION_DISPATCH,
    { schemaVersion: MERCHANT_COMMUNICATIONS_SCHEMA_VERSION, translationId },
    createTranslationDispatchJobId(translationId),
    queue,
  );
}

async function enqueueReconcileBestEffort(
  requestId: string,
  queue: SupportQueue | null,
): Promise<void> {
  await enqueueBestEffort(
    MERCHANT_COMMUNICATIONS_JOB_NAMES.TRANSLATION_RECONCILE,
    {
      schemaVersion: MERCHANT_COMMUNICATIONS_SCHEMA_VERSION,
      reconciliationRequestId: requestId,
    },
    createTranslationReconcileJobId(requestId),
    queue,
  );
}

export type MerchantSupportThreadSummary = ThreadRow;

export type MerchantSupportThreadDetail = {
  thread: ThreadRow;
  messages: MessageRow[];
};

export async function getMerchantSupportThreads(input: {
  page: number;
  pageSize: number;
  search?: string;
}): Promise<{
  items: MerchantSupportThreadSummary[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}> {
  await requirePlatformAdminRead();
  const safePage = pageNumber(input.page);
  const safePageSize = pageSize(input.pageSize);
  const search = input.search?.trim().slice(0, 120) ?? '';
  const pattern = `%${search}%`;

  const rows = await prisma.$queryRaw<ThreadRow[]>(Prisma.sql`
    SELECT
      t."id",
      t."shopId",
      s."domain",
      t."assignedPlatformAdminId",
      t."needsAdminResponse",
      t."lastMessageAt",
      t."lastMerchantMessageAt",
      COUNT(m."id")::int AS "messageCount"
    FROM "support"."MerchantSupportThread" t
    INNER JOIN "commerce"."Shop" s ON s."id" = t."shopId"
    LEFT JOIN "support"."MerchantSupportMessage" m ON m."threadId" = t."id"
    WHERE (${search} = '' OR s."domain" ILIKE ${pattern})
    GROUP BY t."id", s."domain"
    ORDER BY t."lastMessageAt" DESC NULLS LAST, t."id" ASC
    LIMIT ${safePageSize} OFFSET ${(safePage - 1) * safePageSize}
  `);
  const [{ count }] = await prisma.$queryRaw<[{ count: bigint }]>(Prisma.sql`
    SELECT COUNT(*)::bigint AS "count"
    FROM "support"."MerchantSupportThread" t
    INNER JOIN "commerce"."Shop" s ON s."id" = t."shopId"
    WHERE (${search} = '' OR s."domain" ILIKE ${pattern})
  `);
  const totalItems = Number(count);
  return {
    items: rows,
    page: safePage,
    pageSize: safePageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / safePageSize)),
  };
}

export async function getMerchantSupportThread(
  threadId: string,
): Promise<MerchantSupportThreadDetail | null> {
  await requirePlatformAdminRead();
  const rows = await prisma.$queryRaw<ThreadRow[]>(Prisma.sql`
    SELECT
      t."id", t."shopId", s."domain", t."assignedPlatformAdminId",
      t."needsAdminResponse", t."lastMessageAt", t."lastMerchantMessageAt",
      COUNT(m."id")::int AS "messageCount"
    FROM "support"."MerchantSupportThread" t
    INNER JOIN "commerce"."Shop" s ON s."id" = t."shopId"
    LEFT JOIN "support"."MerchantSupportMessage" m ON m."threadId" = t."id"
    WHERE t."id" = ${threadId}
    GROUP BY t."id", s."domain"
  `);
  const thread = rows[0];
  if (!thread) return null;

  const messages = await prisma.$queryRaw<MessageRow[]>(Prisma.sql`
    SELECT
      m."id", m."kind", m."state", m."originalBody", m."sourceLanguageTag",
      m."displayLanguageTag", m."createdAt", m."readAt",
      tr."translatedBody", tr."status" AS "translationStatus"
    FROM "support"."MerchantSupportMessage" m
    LEFT JOIN LATERAL (
      SELECT "translatedBody", "status"
      FROM "support"."MerchantMessageTranslation"
      WHERE "messageId" = m."id"
      ORDER BY "createdAt" DESC
      LIMIT 1
    ) tr ON true
    WHERE m."threadId" = ${threadId}
    ORDER BY m."createdAt" ASC, m."id" ASC
    LIMIT ${MAX_THREAD_MESSAGES}
  `);

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "support"."MerchantSupportMessage"
    SET "readAt" = NOW(), "updatedAt" = NOW()
    WHERE "threadId" = ${threadId}
      AND "kind" = 'MERCHANT'
      AND "readAt" IS NULL
  `);
  return { thread, messages };
}

export async function composeAdministrativeMessage(input: {
  threadId: string;
  body: string;
  database?: DatabaseClient;
  queue?: SupportQueue | null;
}): Promise<{ messageId: string; translationId: string | null }> {
  const principal = await requirePlatformAdminMutation();
  const body = AuthoredSupportBodySchema.parse(input.body);
  const database: DatabaseClient =
    input.database ?? (prisma as unknown as DatabaseClient);
  const messageId = randomUUID();
  const result = await database.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<[{ shopId: string; assignedPlatformAdminId: string | null; merchantMessageVersion: number; defaultLanguageTag: string | null }]>(Prisma.sql`
      SELECT t."shopId", t."assignedPlatformAdminId", t."merchantMessageVersion",
        ss."defaultLanguageTag"
      FROM "support"."MerchantSupportThread" t
      LEFT JOIN "shopify"."ShopSettings" ss ON ss."shopId" = t."shopId"
      WHERE t."id" = ${input.threadId}
      FOR UPDATE
    `);
    const thread = rows[0];
    if (!thread) throw new Error('Support thread not found.');
    if (thread.assignedPlatformAdminId !== principal.id) {
      throw new Error('Only the assigned platform administrator may send messages.');
    }

    const target = targetLanguage(thread.defaultLanguageTag);
    const needsTranslation = requiresMerchantTranslation(
      PLATFORM_SUPPORT_LANGUAGE_TAG,
      target,
    );
    const state = needsTranslation ? 'PROCESSING' : 'AVAILABLE';
    const now = new Date();
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO "support"."MerchantSupportMessage" (
        "id", "threadId", "kind", "state", "originalBody", "sourceLanguageTag",
        "displayLanguageTag", "platformAdminId", "availableAt",
        "respondsThroughMerchantVersion", "createdAt", "updatedAt"
      ) VALUES (
        ${messageId}, ${input.threadId}, 'ADMINISTRATIVE', ${state}, ${body},
        ${PLATFORM_SUPPORT_LANGUAGE_TAG}, ${target}, ${principal.id},
        ${needsTranslation ? null : now}, ${thread.merchantMessageVersion}, ${now}, ${now}
      )
    `);

    let translationId: string | null = null;
    if (needsTranslation) {
      translationId = randomUUID();
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO "support"."MerchantMessageTranslation" (
          "id", "messageId", "direction", "sourceLanguageTag", "targetLanguageTag",
          "status", "createdAt", "updatedAt"
        ) VALUES (
          ${translationId}, ${messageId}, 'ADMIN_TO_MERCHANT',
          ${PLATFORM_SUPPORT_LANGUAGE_TAG}, ${target}, 'PENDING', ${now}, ${now}
        )
      `);
    }

    await transaction.$executeRaw(Prisma.sql`
      UPDATE "support"."MerchantSupportThread"
      SET "lastMessageAt" = ${now},
        "lastAdministrativeMessageAt" = CASE
          WHEN ${!needsTranslation} AND "merchantMessageVersion" = ${thread.merchantMessageVersion}
            THEN ${now}
          ELSE "lastAdministrativeMessageAt"
        END,
        "needsAdminResponse" = CASE
          WHEN ${!needsTranslation} AND "merchantMessageVersion" = ${thread.merchantMessageVersion} THEN false
          ELSE "needsAdminResponse"
        END,
        "updatedAt" = ${now}
      WHERE "id" = ${input.threadId}
    `);
    return { translationId };
  });

  if (result.translationId) {
    await enqueueDispatchBestEffort(
      result.translationId,
      input.queue === undefined ? await getMerchantCommunicationsQueue() : input.queue,
    );
  }
  return { messageId, translationId: result.translationId };
}

export async function requestFailedTranslationReconciliation(input: {
  translationId: string;
  database?: DatabaseClient;
  queue?: SupportQueue | null;
}): Promise<string> {
  const principal = await requirePlatformAdminMutation();
  const requestId = randomUUID();
  const database: DatabaseClient =
    input.database ?? (prisma as unknown as DatabaseClient);
  await database.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<[{ status: string; threadId: string }]>(Prisma.sql`
      SELECT tr."status", m."threadId"
      FROM "support"."MerchantMessageTranslation" tr
      INNER JOIN "support"."MerchantSupportMessage" m ON m."id" = tr."messageId"
      WHERE tr."id" = ${input.translationId}
    `);
    const translation = rows[0];
    if (!translation || translation.status !== 'FAILED') {
      throw new Error('A failed translation is required.');
    }
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO "support"."MerchantTranslationReconciliationRequest" (
        "id", "requestedByPlatformAdminId", "scope", "translationId", "status"
      ) VALUES (${requestId}, ${principal.id}, 'TRANSLATION', ${input.translationId}, 'PENDING')
    `);
  });
  await enqueueReconcileBestEffort(
    requestId,
    input.queue === undefined ? await getMerchantCommunicationsQueue() : input.queue,
  );
  return requestId;
}

export async function requestFailedTranslationsReconciliation(input: {
  database?: DatabaseClient;
  queue?: SupportQueue | null;
}): Promise<string> {
  const principal = await requirePlatformAdminMutation();
  if (!adminCanRequestGlobalReconciliation(principal)) {
    throw new Error('SUPER_ADMIN access is required.');
  }
  const requestId = randomUUID();
  const database: DatabaseClient =
    input.database ?? (prisma as unknown as DatabaseClient);
  await database.$executeRaw(Prisma.sql`
    INSERT INTO "support"."MerchantTranslationReconciliationRequest" (
      "id", "requestedByPlatformAdminId", "scope", "translationId", "status"
    ) VALUES (${requestId}, ${principal.id}, 'FAILED_TRANSLATIONS', NULL, 'PENDING')
  `);
  await enqueueReconcileBestEffort(
    requestId,
    input.queue === undefined ? await getMerchantCommunicationsQueue() : input.queue,
  );
  return requestId;
}

export async function requestAdditionalTranslation(input: {
  messageId: string;
  targetLanguageTag: string;
  database?: DatabaseClient;
  queue?: SupportQueue | null;
}): Promise<string | null> {
  await requirePlatformAdminMutation();
  const target = LanguageTagSchema.parse(input.targetLanguageTag);
  const database: DatabaseClient =
    input.database ?? (prisma as unknown as DatabaseClient);
  const result = await database.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<[
      { kind: string; sourceLanguageTag: string }
    ]>(Prisma.sql`
      SELECT "kind", "sourceLanguageTag"
      FROM "support"."MerchantSupportMessage"
      WHERE "id" = ${input.messageId}
      FOR SHARE
    `);
    const message = rows[0];
    if (!message) throw new Error('Support message not found.');
    if (!requiresMerchantTranslation(message.sourceLanguageTag, target)) return null;
    const directionByKind = {
      MERCHANT: 'MERCHANT_TO_ADMIN',
      ADMINISTRATIVE: 'ADMIN_TO_MERCHANT',
      SYSTEM: 'SYSTEM_TO_MERCHANT',
    } as const;
    const direction = directionByKind[message.kind as keyof typeof directionByKind];
    if (!direction) throw new Error('Unsupported support message kind.');

    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO "support"."MerchantMessageTranslation" (
        "id", "messageId", "direction", "sourceLanguageTag", "targetLanguageTag",
        "status", "createdAt", "updatedAt"
      ) VALUES (
        ${randomUUID()}, ${input.messageId}, ${direction},
        ${message.sourceLanguageTag}, ${target}, 'PENDING', NOW(), NOW()
      ) ON CONFLICT ("messageId", "targetLanguageTag") DO NOTHING
    `);
    const translations = await transaction.$queryRaw<[
      { id: string; status: string }
    ]>(Prisma.sql`
      SELECT "id", "status"
      FROM "support"."MerchantMessageTranslation"
      WHERE "messageId" = ${input.messageId} AND "targetLanguageTag" = ${target}
    `);
    const translation = translations[0];
    return translation
      ? { id: translation.id, status: translation.status }
      : null;
  });

  if (result?.status === 'PENDING') {
    await enqueueDispatchBestEffort(
      result.id,
      input.queue === undefined ? await getMerchantCommunicationsQueue() : input.queue,
    );
  }
  return result?.id ?? null;
}

export function adminCanSend(principal: PlatformAdminPrincipal, ownerId: string | null): boolean {
  return principal.id === ownerId;
}

export function adminCanRequestGlobalReconciliation(
  principal: PlatformAdminPrincipal,
): boolean {
  return principal.role === 'SUPER_ADMIN';
}

export function adminNeedsTranslation(source: string, target: string): boolean {
  return languageBase(source) !== languageBase(target);
}
