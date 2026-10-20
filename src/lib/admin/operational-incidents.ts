import { prisma } from '../prisma';
import { requirePlatformAdminRead } from '../auth/platform-admin';

export const INCIDENT_FILTERS = ['OPEN', 'RESOLVED'] as const;
export type IncidentFilter = (typeof INCIDENT_FILTERS)[number] | 'ALL';
export type OperationalIncidentQuery = {
  status?: IncidentFilter;
  sourceService?: string;
  severity?: string;
  environment?: string;
  incidentKey?: string;
  page?: number;
};

const bounded = (value?: string) => value && /^[a-zA-Z0-9_.-]{1,64}$/.test(value) ? value : undefined;
const key = (value?: string) => value && /^[a-f0-9]{64}$/.test(value) ? value : undefined;

/** Authenticated, bounded, read-only operational triage. No raw event payloads. */
export async function getOperationalIncidents(input: OperationalIncidentQuery = {}) {
  await requirePlatformAdminRead();
  const page = Math.min(1000, Math.max(1, Math.trunc(input.page || 1)));
  const where = {
    ...(input.status && input.status !== 'ALL' && INCIDENT_FILTERS.includes(input.status as 'OPEN') ? { status: input.status } : {}),
    ...(bounded(input.sourceService) ? { sourceService: input.sourceService } : {}),
    ...(bounded(input.severity) ? { severity: input.severity } : {}),
    ...(bounded(input.environment) ? { environment: input.environment } : {}),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.operationalIncident.count({ where }),
    prisma.operationalIncident.findMany({
      where, orderBy: [{ lastOccurredAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * 25, take: 25,
      select: { incidentKey: true, sourceService: true, environment: true,
        category: true, reasonCode: true, resourceKey: true, severity: true, status: true,
        occurrenceCount: true, firstOccurredAt: true, lastOccurredAt: true,
        lastCorrelationId: true, ownerPlatformAdminId: true,
        resolvedAt: true, resolvedByPlatformAdminId: true,
        shop: { select: { domain: true } },
      },
    }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / 25)) };
}

export async function getOperationalIncidentDetail(incidentKey: string) {
  await requirePlatformAdminRead();
  if (!key(incidentKey)) return null;
  const incident = await prisma.operationalIncident.findUnique({
    where: { incidentKey },
    select: {
      incidentKey: true, sourceService: true, environment: true, category: true,
      reasonCode: true, resourceKey: true, severity: true, status: true,
      occurrenceCount: true, firstOccurredAt: true, lastOccurredAt: true,
      lastCorrelationId: true, lastErrorMessage: true, ownerPlatformAdminId: true, assignedAt: true,
      resolvedAt: true, resolvedByPlatformAdminId: true, resolutionNote: true,
      shop: { select: { domain: true, merchantSupportThread: { select: { id: true } } } },
      events: { orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 100,
        select: { id: true, eventType: true, actorPlatformAdminId: true,
          correlationId: true, occurredAt: true, errorMessage: true },
      },
    },
  });
  return incident;
}
