'use server';

import {
  createBillingTriageAction,
  type BillingTriageAction,
} from '@/lib/admin/billing-lifecycle';

export async function createBillingTriageActionAction(input: {
  threadId: string;
  messageId: string;
  action: BillingTriageAction;
  reason: string;
  purchaseId?: string;
}) {
  return createBillingTriageAction(input);
}