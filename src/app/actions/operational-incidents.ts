'use server';

import { transitionOperationalIncident, type IncidentTransition } from '@/lib/admin/operational-incident-actions';
import { redirect } from 'next/navigation';

export async function operationalIncidentAction(form: FormData): Promise<void> {
  const incidentKey = form.get('incidentKey');
  const action = form.get('action');
  if (typeof incidentKey !== 'string' || typeof action !== 'string' || !['TAKE', 'RELEASE', 'REASSIGN', 'RESOLVE'].includes(action)) throw new Error('Invalid incident action');
  const targetAdminId = form.get('targetAdminId');
  const resolutionNote = form.get('resolutionNote');
  await transitionOperationalIncident({ incidentKey, action: action as IncidentTransition,
    targetAdminId: typeof targetAdminId === 'string' ? targetAdminId : undefined,
    resolutionNote: typeof resolutionNote === 'string' ? resolutionNote : undefined });
  redirect(`/operational-incidents?incident=${encodeURIComponent(incidentKey)}`);
}
