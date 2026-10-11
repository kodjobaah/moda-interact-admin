import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

export type IncidentTransition = 'TAKE' | 'RELEASE' | 'REASSIGN' | 'RESOLVE';
const INCIDENT_KEY = /^[a-f0-9]{64}$/;
const MAX_NOTE = 1000;
export class IncidentTransitionConflict extends Error {
  constructor() { super('Incident was changed by another administrator. Refresh and try again.'); }
}

type Input = { incidentKey: string; action: IncidentTransition; targetAdminId?: string; resolutionNote?: string };

/** All state changes and their audit records commit or roll back together. */
export async function transitionOperationalIncident(input: Input): Promise<void> {
  const [{ requirePlatformAdminMutation }, { prisma }, { revalidatePath }] = await Promise.all([
    import('../auth/platform-admin'),
    import('../prisma'),
    import('next/cache'),
  ]);
  const principal = await requirePlatformAdminMutation();
  await executeOperationalIncidentTransition(prisma, principal, input);
  revalidatePath('/operational-incidents');
}

/** Database boundary also exercised by the disposable-PostgreSQL integration suite. */
export async function executeOperationalIncidentTransition(
  database: Pick<PrismaClient, '$transaction'>,
  principal: { id: string; role: string },
  input: Input,
  createAuditEventId: () => string = randomUUID,
): Promise<void> {
  if (!INCIDENT_KEY.test(input.incidentKey)) throw new Error('Invalid incident identifier');
  if (!['TAKE', 'RELEASE', 'REASSIGN', 'RESOLVE'].includes(input.action)) throw new Error('Invalid incident action');
  const note = input.resolutionNote?.trim();
  if (input.action === 'RESOLVE' && (!note || note.length > MAX_NOTE)) throw new Error('Resolution rationale is required (maximum 1000 characters)');
  if (input.action === 'REASSIGN' && (!input.targetAdminId || input.targetAdminId.length > 128)) throw new Error('Select a valid administrator');
  if (input.action === 'REASSIGN' && principal.role !== 'SUPER_ADMIN') throw new Error('Only super administrators may reassign incidents');

  await database.$transaction(async tx => {
    const current = await tx.operationalIncident.findUnique({
      where: { incidentKey: input.incidentKey },
      select: { id: true, status: true, revision: true, ownerPlatformAdminId: true },
    });
    if (!current) throw new Error('Incident not found');
    if (current.status !== 'OPEN') throw new Error('Only open incidents can be changed');
    if (input.action === 'TAKE' && current.ownerPlatformAdminId) throw new IncidentTransitionConflict();
    if ((input.action === 'RELEASE' || input.action === 'RESOLVE') && current.ownerPlatformAdminId !== principal.id) throw new Error('Take ownership before changing this incident');
    if (input.action === 'REASSIGN') {
      if (current.ownerPlatformAdminId === input.targetAdminId) throw new Error('Already assigned to this administrator');
      const target = await tx.platformAdmin.findUnique({ where: { id: input.targetAdminId! }, select: { active: true } });
      if (!target?.active) throw new Error('Target administrator is not active');
    }
    const now = new Date();
    const nextOwner = input.action === 'TAKE' ? principal.id : input.action === 'REASSIGN' ? input.targetAdminId! : input.action === 'RELEASE' ? null : current.ownerPlatformAdminId;
    const eventType = ({ TAKE: 'CLAIMED', RELEASE: 'RELEASED', REASSIGN: 'REASSIGNED', RESOLVE: 'RESOLVED' } as const)[input.action];
    const changed = await tx.operationalIncident.updateMany({
      where: { id: current.id, revision: current.revision, status: 'OPEN', ownerPlatformAdminId: current.ownerPlatformAdminId },
      data: {
        revision: { increment: 1 },
        ...(input.action === 'RESOLVE' ? { status: 'RESOLVED', resolvedAt: now, resolvedByPlatformAdminId: principal.id, resolutionNote: note } :
          { ownerPlatformAdminId: nextOwner, assignedAt: nextOwner ? now : null }),
      },
    });
    if (changed.count !== 1) throw new IncidentTransitionConflict();
    await tx.operationalIncidentEvent.create({ data: {
      id: createAuditEventId(), incidentId: current.id, eventType,
      actorPlatformAdminId: principal.id, occurredAt: now,
    } });
  });
}
