import type { PrismaClient } from '@prisma/client';
import { requirePlatformAdminRead } from '@/lib/auth/platform-admin';
import { prisma } from '@/lib/prisma';
import {
  safeModerationCategories,
  type HumanMessagingDashboard,
  type HumanMessagingHistoryItem,
  type ModerationIncidentItem,
} from './human-messaging-contract';
import type { PageResult } from './types';

const HISTORY_PAGE_SIZE = 10;
const INCIDENT_PAGE_SIZE = 15;

function paged<T>(items: T[], count: number, page: number, pageSize: number): PageResult<T> {
  return { items, page, pageSize, totalItems: count, totalPages: Math.max(1, Math.ceil(count / pageSize)) };
}

function boundedPage(value: number, count: number, pageSize: number): number {
  return Math.min(Math.max(1, Math.floor(value) || 1), Math.max(1, Math.ceil(count / pageSize)));
}

/** SUPER_ADMIN-only shop projection. Internal restriction notes never enter moderation incidents. */
export async function getHumanMessagingDashboard(
  shopId: string,
  historyPage: number,
  incidentPage: number,
): Promise<HumanMessagingDashboard> {
  const principal = await requirePlatformAdminRead();
  if (principal.role !== 'SUPER_ADMIN') throw new Error('SUPER_ADMIN access is required.');
  return readHumanMessagingDashboard(prisma, shopId, historyPage, incidentPage);
}

/** Database projection deliberately takes one authenticated shop ID; injectable for tests. */
export async function readHumanMessagingDashboard(
  database: Pick<PrismaClient,
    'shopHumanMessagingRestriction' | 'shopHumanMessagingRestrictionEvent' | 'conversationModerationAssessment'>,
  shopId: string,
  historyPage: number,
  incidentPage: number,
): Promise<HumanMessagingDashboard> {
  const [restriction, historyCount, incidentCount] = await Promise.all([
    database.shopHumanMessagingRestriction.findUnique({ where: { shopId }, select: {
      status: true, revision: true, reasonCode: true, updatedAt: true,
    } }),
    database.shopHumanMessagingRestrictionEvent.count({ where: { shopId } }),
    database.conversationModerationAssessment.count({ where: { shopId } }),
  ]);
  const safeHistoryPage = boundedPage(historyPage, historyCount, HISTORY_PAGE_SIZE);
  const safeIncidentPage = boundedPage(incidentPage, incidentCount, INCIDENT_PAGE_SIZE);
  const [events, assessments] = await Promise.all([
    database.shopHumanMessagingRestrictionEvent.findMany({
      where: { shopId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (safeHistoryPage - 1) * HISTORY_PAGE_SIZE, take: HISTORY_PAGE_SIZE,
      select: {
        id: true, createdAt: true, fromStatus: true, toStatus: true, revision: true,
        reasonCode: true, reasonNote: true,
        platformAdmin: { select: { displayName: true, email: true } },
      },
    }),
    database.conversationModerationAssessment.findMany({
      where: { shopId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (safeIncidentPage - 1) * INCIDENT_PAGE_SIZE, take: INCIDENT_PAGE_SIZE,
      select: {
        id: true, createdAt: true, subject: true, decision: true, categories: true,
        reviewedAt: true, reviewDisposition: true,
      },
    }),
  ]);
  const history: HumanMessagingHistoryItem[] = events.map((event) => ({
    id: event.id, createdAt: event.createdAt, fromStatus: event.fromStatus,
    toStatus: event.toStatus, revision: event.revision, reasonCode: event.reasonCode,
    reasonNote: event.reasonNote,
    admin: event.platformAdmin.displayName ?? event.platformAdmin.email,
  }));
  const incidents: ModerationIncidentItem[] = assessments.map((assessment) => ({
    id: assessment.id, createdAt: assessment.createdAt,
    subject: ({
      CUSTOMER_MESSAGE: 'CUSTOMER', HUMAN_COMMAND: 'HUMAN',
      AGENT_MESSAGE: 'AGENT', AUTOMATION_MESSAGE: 'AUTOMATION',
    } as const)[assessment.subject],
    decision: assessment.decision,
    categories: safeModerationCategories(assessment.categories),
    status: assessment.decision === 'PENDING' ? 'PENDING'
      : assessment.decision === 'CHECKING' ? 'IN_PROGRESS'
      : assessment.decision === 'RETRYABLE_ERROR' ? 'RETRY' : 'ASSESSED',
    reviewed: assessment.reviewedAt !== null,
    reviewDisposition: assessment.reviewDisposition,
  }));
  return {
    shopId, status: restriction?.status ?? 'ACTIVE', revision: restriction?.revision ?? 0,
    reasonCode: restriction?.reasonCode ?? null, updatedAt: restriction?.updatedAt ?? null,
    history: paged(history, historyCount, safeHistoryPage, HISTORY_PAGE_SIZE),
    incidents: paged(incidents, incidentCount, safeIncidentPage, INCIDENT_PAGE_SIZE),
  };
}
