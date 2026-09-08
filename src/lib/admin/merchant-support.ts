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
  createdAt: Date;
  readAt: Date | null;
  translations: TranslationView[];
};

type TranslationView = {
  id: string;
  targetLanguageTag: string;
  status: string;
  translatedBody: string | null;
  createdAt: Date;
};

type TransactionClient = {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
  $executeRaw(query: Prisma.Sql): Promise<number>;
};

type DatabaseClient = {
  $transaction<T>(callback: (transaction: TransactionClient) => Promise<T>): Promise<T>;
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
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

const DEVELOPMENT_PLATFORM_ADMIN = {
  id: 'development-platform-admin',
  provider: 'development',
  providerSubject: 'development-platform-admin',
  email: 'development-platform-admin@local.invalid',
  displayName: 'Development Platform Admin',
  role: 'SUPER_ADMIN',
  active: true,
} as const;

async function ensureDevelopmentPlatformAdmin(
  transaction: TransactionClient,
  principal: PlatformAdminPrincipal,
): Promise<void> {
  if (!principal.developmentBypass) return;

  await transaction.$executeRaw(Prisma.sql`
    INSERT INTO "public"."PlatformAdmin" (
      "id", "provider", "providerSubject", "email", "displayName", "role", "active", "updatedAt"
    ) VALUES (
      ${DEVELOPMENT_PLATFORM_ADMIN.id}, ${DEVELOPMENT_PLATFORM_ADMIN.provider},
      ${DEVELOPMENT_PLATFORM_ADMIN.providerSubject}, ${DEVELOPMENT_PLATFORM_ADMIN.email},
      ${DEVELOPMENT_PLATFORM_ADMIN.displayName}, CAST(${DEVELOPMENT_PLATFORM_ADMIN.role} AS "public"."PlatformAdminRole"),
      ${DEVELOPMENT_PLATFORM_ADMIN.active}, CURRENT_TIMESTAMP
    ) ON CONFLICT ("id") DO NOTHING
  `);

  const rows = await transaction.$queryRaw<[
    {
      id: string;
      provider: string;
      providerSubject: string;
      email: string;
      displayName: string | null;
      role: string;
      active: boolean;
    },
  ]>(Prisma.sql`
    SELECT "id", "provider", "providerSubject", "email", "displayName", "role", "active"
    FROM "public"."PlatformAdmin"
    WHERE "id" = ${DEVELOPMENT_PLATFORM_ADMIN.id}
  `);
  const backing = rows[0];
  if (
    !backing ||
    backing.id !== DEVELOPMENT_PLATFORM_ADMIN.id ||
    backing.provider !== DEVELOPMENT_PLATFORM_ADMIN.provider ||
    backing.providerSubject !== DEVELOPMENT_PLATFORM_ADMIN.providerSubject ||
    backing.email !== DEVELOPMENT_PLATFORM_ADMIN.email ||
    backing.displayName !== DEVELOPMENT_PLATFORM_ADMIN.displayName ||
    backing.role !== DEVELOPMENT_PLATFORM_ADMIN.role ||
    backing.active !== DEVELOPMENT_PLATFORM_ADMIN.active
  ) {
    throw new Error('The reserved development platform administrator identity conflicts with the database.');
  }
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

export type PendingSupportFilter =
  | 'all'
  | 'unassigned'
  | 'assigned-to-me'
  | 'assigned-to-others';

export type SupportOwnerSummary = {
  id: string;
  displayName: string | null;
  email: string;
};

export type PendingSupportThreadSummary = {
  id: string;
  shopId: string;
  domain: string;
  assignedPlatformAdminId: string | null;
  owner: SupportOwnerSummary | null;
  needsAdminResponse: true;
  lastMerchantMessageAt: Date | null;
};

export type MerchantSupportShopSuggestion = {
  threadId: string;
  shopId: string;
  domain: string;
  brandName: string | null;
  needsAdminResponse: boolean;
};

type PendingSupportQueryResult = {
  items: PendingSupportThreadSummary[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

type OwnershipResult = {
  claimed: boolean;
  owner: SupportOwnerSummary | null;
};

function pendingFilterSql(
  filter: PendingSupportFilter,
  principalId: string,
): Prisma.Sql {
  if (filter === 'unassigned') {
    return Prisma.sql`t."assignedPlatformAdminId" IS NULL`;
  }
  if (filter === 'assigned-to-me') {
    return Prisma.sql`t."assignedPlatformAdminId" = ${principalId}`;
  }
  if (filter === 'assigned-to-others') {
    return Prisma.sql`t."assignedPlatformAdminId" IS NOT NULL AND t."assignedPlatformAdminId" <> ${principalId}`;
  }
  return Prisma.sql`TRUE`;
}

function ownerSelectSql(): Prisma.Sql {
  return Prisma.sql`
    a."id" AS "ownerId",
    a."displayName" AS "ownerDisplayName",
    a."email" AS "ownerEmail"
  `;
}

function ownerFromRow(row: {
  ownerId: string | null;
  ownerDisplayName: string | null;
  ownerEmail: string | null;
}): SupportOwnerSummary | null {
  if (!row.ownerId || !row.ownerEmail) return null;
  return {
    id: row.ownerId,
    displayName: row.ownerDisplayName,
    email: row.ownerEmail,
  };
}

async function readOwner(
  transaction: TransactionClient,
  threadId: string,
): Promise<SupportOwnerSummary | null> {
  const rows = await transaction.$queryRaw<[
    { ownerId: string | null; ownerDisplayName: string | null; ownerEmail: string | null }
  ]>(Prisma.sql`
    SELECT a."id" AS "ownerId", a."displayName" AS "ownerDisplayName", a."email" AS "ownerEmail"
    FROM "support"."MerchantSupportThread" t
    LEFT JOIN "public"."PlatformAdmin" a ON a."id" = t."assignedPlatformAdminId"
    WHERE t."id" = ${threadId}
  `);
  return rows[0] ? ownerFromRow(rows[0]) : null;
}

export async function getPendingMerchantSupportThreads(input: {
  page: number;
  pageSize: number;
  filter?: PendingSupportFilter;
  search?: string;
  database?: DatabaseClient;
}): Promise<PendingSupportQueryResult> {
  const principal = await requirePlatformAdminRead();
  const client = input.database ?? (prisma as unknown as DatabaseClient);
  const safePage = pageNumber(input.page);
  const safePageSize = pageSize(input.pageSize);
  const filter = input.filter ?? 'all';
  const search = input.search?.trim().slice(0, 120) ?? '';
  const pattern = `%${search}%`;
  const pendingFilter = pendingFilterSql(filter, principal.id);
  const where = Prisma.sql`
    t."needsAdminResponse" = true
    AND ${pendingFilter}
    AND (
      ${search} = ''
      OR s."domain" ILIKE ${pattern}
      OR sb."brandName" ILIKE ${pattern}
    )
  `;
  const rows = await client.$queryRaw<
    Array<{
      id: string;
      shopId: string;
      domain: string;
      assignedPlatformAdminId: string | null;
      lastMerchantMessageAt: Date | null;
      ownerId: string | null;
      ownerDisplayName: string | null;
      ownerEmail: string | null;
    }>
  >(Prisma.sql`
    SELECT t."id", t."shopId", s."domain", t."assignedPlatformAdminId",
      t."lastMerchantMessageAt", ${ownerSelectSql()}
    FROM "support"."MerchantSupportThread" t
    INNER JOIN "commerce"."Shop" s ON s."id" = t."shopId"
    LEFT JOIN "shopify"."ShopBrand" sb ON sb."shopId" = s."id"
    LEFT JOIN "public"."PlatformAdmin" a ON a."id" = t."assignedPlatformAdminId"
    WHERE ${where}
    ORDER BY t."lastMerchantMessageAt" DESC NULLS LAST, t."id" ASC
    LIMIT ${safePageSize} OFFSET ${(safePage - 1) * safePageSize}
  `);
  const [{ count }] = await client.$queryRaw<[{ count: bigint }]>(Prisma.sql`
    SELECT COUNT(*)::bigint AS "count"
    FROM "support"."MerchantSupportThread" t
    INNER JOIN "commerce"."Shop" s ON s."id" = t."shopId"
    LEFT JOIN "shopify"."ShopBrand" sb ON sb."shopId" = s."id"
    WHERE ${where}
  `);
  const totalItems = Number(count);
  return {
    items: rows.map((row) => ({
      id: row.id,
      shopId: row.shopId,
      domain: row.domain,
      assignedPlatformAdminId: row.assignedPlatformAdminId,
      owner: ownerFromRow(row),
      needsAdminResponse: true,
      lastMerchantMessageAt: row.lastMerchantMessageAt,
    })),
    page: safePage,
    pageSize: safePageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / safePageSize)),
  };
}

export async function getMerchantSupportShopSuggestions(input: {
  query: string;
  limit?: number;
  database?: DatabaseClient;
}): Promise<MerchantSupportShopSuggestion[]> {
  await requirePlatformAdminRead();
  const query = input.query.trim().slice(0, 120);
  if (query.length < 2) return [];

  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 8), 1), 8);
  const pattern = `%${query}%`;
  const database = input.database ?? (prisma as unknown as DatabaseClient);
  const rows = await database.$queryRaw<
    Array<{
      threadId: string;
      shopId: string;
      domain: string;
      brandName: string | null;
      needsAdminResponse: boolean;
    }>
  >(Prisma.sql`
    SELECT
      t."id" AS "threadId",
      s."id" AS "shopId",
      s."domain",
      sb."brandName",
      t."needsAdminResponse"
    FROM "support"."MerchantSupportThread" t
    INNER JOIN "commerce"."Shop" s ON s."id" = t."shopId"
    LEFT JOIN "shopify"."ShopBrand" sb ON sb."shopId" = s."id"
    WHERE s."domain" ILIKE ${pattern} OR sb."brandName" ILIKE ${pattern}
    ORDER BY t."needsAdminResponse" DESC,
      t."lastMessageAt" DESC NULLS LAST,
      s."domain" ASC,
      t."id" ASC
    LIMIT ${limit}
  `);
  return rows;
}

export async function takeMerchantSupportThreadOwnership(
  threadId: string,
  database?: DatabaseClient,
): Promise<OwnershipResult> {
  const principal = await requirePlatformAdminMutation();
  const client = database ?? (prisma as unknown as DatabaseClient);
  return client.$transaction(async (transaction) => {
    await ensureDevelopmentPlatformAdmin(transaction, principal);
    const claimed = await transaction.$executeRaw(Prisma.sql`
      UPDATE "support"."MerchantSupportThread"
      SET "assignedPlatformAdminId" = ${principal.id}, "assignedAt" = NOW(), "updatedAt" = NOW()
      WHERE "id" = ${threadId} AND "assignedPlatformAdminId" IS NULL
    `);
    const owner = await readOwner(transaction, threadId);
    if (!owner) throw new Error('Support thread not found.');
    return { claimed: claimed === 1, owner };
  });
}

export async function releaseMerchantSupportThreadOwnership(
  threadId: string,
  database?: DatabaseClient,
): Promise<void> {
  const principal = await requirePlatformAdminMutation();
  const client = database ?? (prisma as unknown as DatabaseClient);
  const released = await client.$executeRaw(Prisma.sql`
    UPDATE "support"."MerchantSupportThread"
    SET "assignedPlatformAdminId" = NULL, "assignedAt" = NULL, "updatedAt" = NOW()
    WHERE "id" = ${threadId}
      AND (${adminCanRelease(principal, null)} OR "assignedPlatformAdminId" = ${principal.id})
  `);
  if (released !== 1) {
    throw new Error('Only the assigned platform administrator or a SUPER_ADMIN may release ownership.');
  }
}

export async function reassignMerchantSupportThreadOwnership(input: {
  threadId: string;
  targetPlatformAdminId: string;
  database?: DatabaseClient;
}): Promise<SupportOwnerSummary> {
  const principal = await requirePlatformAdminMutation();
  if (principal.role !== 'SUPER_ADMIN') {
    throw new Error('SUPER_ADMIN access is required.');
  }
  const client = input.database ?? (prisma as unknown as DatabaseClient);
  return client.$transaction(async (transaction) => {
    const target = await transaction.$queryRaw<[
      { id: string; displayName: string | null; email: string } 
    ]>(Prisma.sql`
      SELECT "id", "displayName", "email"
      FROM "public"."PlatformAdmin"
      WHERE "id" = ${input.targetPlatformAdminId} AND "active" = true
    `);
    if (!target[0]) throw new Error('An active platform administrator is required.');
    const updated = await transaction.$executeRaw(Prisma.sql`
      UPDATE "support"."MerchantSupportThread"
      SET "assignedPlatformAdminId" = ${input.targetPlatformAdminId}, "assignedAt" = NOW(), "updatedAt" = NOW()
      WHERE "id" = ${input.threadId}
    `);
    if (updated !== 1) throw new Error('Support thread not found.');
    return {
      id: target[0].id,
      displayName: target[0].displayName,
      email: target[0].email,
    };
  });
}

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

  const messageRows = await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`
      UPDATE "support"."MerchantSupportMessage"
      SET "readAt" = NOW(), "updatedAt" = NOW()
      WHERE "threadId" = ${threadId}
        AND "kind" = 'MERCHANT'
        AND "readAt" IS NULL
    `);

    return transaction.$queryRaw<
      Array<MessageRow & {
        translationId: string | null;
        translationTargetLanguageTag: string | null;
        translatedBody: string | null;
        translationStatus: string | null;
        translationCreatedAt: Date | null;
      }>
    >(Prisma.sql`
      WITH bounded_messages AS (
        SELECT "id", "threadId", "kind", "state", "originalBody", "sourceLanguageTag",
          "displayLanguageTag", "createdAt", "readAt"
        FROM "support"."MerchantSupportMessage"
        WHERE "threadId" = ${threadId}
        ORDER BY "createdAt" ASC, "id" ASC
        LIMIT ${MAX_THREAD_MESSAGES}
      )
      SELECT
        m."id", tr."id" AS "translationId", tr."targetLanguageTag" AS "translationTargetLanguageTag",
        m."kind", m."state", m."originalBody", m."sourceLanguageTag",
        m."displayLanguageTag", m."createdAt", m."readAt", tr."translatedBody",
        tr."status" AS "translationStatus", tr."createdAt" AS "translationCreatedAt"
      FROM bounded_messages m
      LEFT JOIN (
        SELECT "id", "messageId", "targetLanguageTag", "translatedBody", "status", "createdAt",
          ROW_NUMBER() OVER (PARTITION BY "messageId" ORDER BY "createdAt" ASC, "id" ASC) AS translation_rank
        FROM "support"."MerchantMessageTranslation"
      ) tr ON tr."messageId" = m."id" AND tr.translation_rank <= 50
      ORDER BY m."createdAt" ASC, m."id" ASC, tr."createdAt" ASC NULLS LAST, tr."id" ASC NULLS LAST
    `);
  });
  const messages = messageRows.reduce<MessageRow[]>((result, row) => {
    let message = result.find((entry) => entry.id === row.id);
    if (!message) {
      message = {
        id: row.id,
        kind: row.kind,
        state: row.state,
        originalBody: row.originalBody,
        sourceLanguageTag: row.sourceLanguageTag,
        displayLanguageTag: row.displayLanguageTag,
        createdAt: row.createdAt,
        readAt: row.readAt,
        translations: [],
      };
      result.push(message);
    }
    if (row.translationId && row.translationTargetLanguageTag && row.translationStatus && row.translationCreatedAt) {
      message.translations.push({
        id: row.translationId,
        targetLanguageTag: row.translationTargetLanguageTag,
        status: row.translationStatus,
        translatedBody: row.translatedBody,
        createdAt: row.translationCreatedAt,
      });
    }
    return result;
  }, []);
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
    await ensureDevelopmentPlatformAdmin(transaction, principal);
    const rows = await transaction.$queryRaw<[{ shopId: string; assignedPlatformAdminId: string | null; merchantMessageVersion: number; defaultLanguageTag: string | null }]>(Prisma.sql`
      SELECT t."shopId", t."assignedPlatformAdminId", t."merchantMessageVersion",
        ss."defaultLanguageTag"
      FROM "support"."MerchantSupportThread" t
      LEFT JOIN "shopify"."ShopSettings" ss ON ss."shopId" = t."shopId"
      WHERE t."id" = ${input.threadId}
      FOR UPDATE OF t
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
        ${messageId}, ${input.threadId}, 'ADMINISTRATIVE',
        CAST(${state} AS "support"."MerchantSupportMessageState"), ${body},
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
    await ensureDevelopmentPlatformAdmin(transaction, principal);
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
  await database.$transaction(async (transaction) => {
    await ensureDevelopmentPlatformAdmin(transaction, principal);
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO "support"."MerchantTranslationReconciliationRequest" (
        "id", "requestedByPlatformAdminId", "scope", "translationId", "status"
      ) VALUES (${requestId}, ${principal.id}, 'FAILED_TRANSLATIONS', NULL, 'PENDING')
    `);
  });
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
        ${randomUUID()}, ${input.messageId},
        CAST(${direction} AS "support"."MerchantTranslationDirection"),
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

export function adminCanRelease(
  principal: PlatformAdminPrincipal,
  ownerId: string | null,
): boolean {
  return principal.role === 'SUPER_ADMIN' || principal.id === ownerId;
}

export function adminCanRequestGlobalReconciliation(
  principal: PlatformAdminPrincipal,
): boolean {
  return principal.role === 'SUPER_ADMIN';
}

export function adminNeedsTranslation(source: string, target: string): boolean {
  return languageBase(source) !== languageBase(target);
}
