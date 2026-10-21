import type { PageResult } from './types';

export type HumanRestrictionStatus = 'ACTIVE' | 'SUSPENDED';
export type HumanRestrictionReason = 'SPAM' | 'HARASSMENT' | 'THREATS' | 'POLICY_ABUSE' | 'OTHER';
export type ModerationReviewDisposition = 'ACKNOWLEDGED' | 'ESCALATED' | 'FALSE_POSITIVE';
export type HumanActionCode =
  | 'UPDATED' | 'REVIEWED' | 'INVALID' | 'STALE' | 'ALREADY_TARGET'
  | 'ALREADY_REVIEWED' | 'NOT_REVIEWABLE' | 'NOT_FOUND' | 'FORBIDDEN' | 'ERROR';
export type HumanActionState = { ok: boolean; code: HumanActionCode; revision?: number } | null;

export const HUMAN_REASONS: readonly HumanRestrictionReason[] = [
  'SPAM', 'HARASSMENT', 'THREATS', 'POLICY_ABUSE', 'OTHER',
];
export const REVIEW_DISPOSITIONS: readonly ModerationReviewDisposition[] = [
  'ACKNOWLEDGED', 'ESCALATED', 'FALSE_POSITIVE',
];

export class HumanMessagingInputError extends Error {
  readonly code: Exclude<HumanActionCode, 'UPDATED' | 'REVIEWED'>;
  constructor(code: Exclude<HumanActionCode, 'UPDATED' | 'REVIEWED'>) {
    super(code);
    this.code = code;
  }
}

const SHOP_ID = /^[a-z0-9_-]{1,128}$/i;
const ASSESSMENT_ID = /^[a-z0-9_-]{1,128}$/i;
const SAFE_CATEGORY = /^[a-z][a-z0-9/_-]{0,63}$/i;

export function parseRestrictionForm(form: FormData) {
  const shopId = form.get('shopId');
  const intent = form.get('intent');
  const expected = form.get('expectedRevision');
  const reason = form.get('reasonCode');
  const note = form.get('reasonNote');
  if (typeof shopId !== 'string' || !SHOP_ID.test(shopId) ||
      (intent !== 'SUSPEND' && intent !== 'RESTORE') ||
      typeof expected !== 'string' || !/^(0|[1-9]\d{0,9})$/.test(expected) ||
      !Number.isSafeInteger(Number(expected)) || Number(expected) > 2147483647 ||
      !HUMAN_REASONS.includes(reason as HumanRestrictionReason) ||
      typeof note !== 'string' || !note.trim() || note.trim().length > 1000) {
    throw new HumanMessagingInputError('INVALID');
  }
  return {
    shopId, intent: intent as 'SUSPEND' | 'RESTORE', expectedRevision: Number(expected),
    reasonCode: reason as HumanRestrictionReason, reasonNote: note.trim(),
  };
}

export function parseModerationReviewForm(form: FormData) {
  const shopId = form.get('shopId');
  const assessmentId = form.get('assessmentId');
  const disposition = form.get('disposition');
  if (typeof shopId !== 'string' || !SHOP_ID.test(shopId) ||
      typeof assessmentId !== 'string' || !ASSESSMENT_ID.test(assessmentId) ||
      !REVIEW_DISPOSITIONS.includes(disposition as ModerationReviewDisposition)) {
    throw new HumanMessagingInputError('INVALID');
  }
  return { shopId, assessmentId, disposition: disposition as ModerationReviewDisposition };
}

/** Only category names with true flags may reach the incident list; never scores or text. */
export function safeModerationCategories(input: unknown): string[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return [];
  return Object.entries(input)
    .filter(([name, value]) => value === true && SAFE_CATEGORY.test(name))
    .map(([name]) => name)
    .sort()
    .slice(0, 8);
}

export type HumanMessagingHistoryItem = {
  id: string;
  createdAt: Date;
  fromStatus: HumanRestrictionStatus;
  toStatus: HumanRestrictionStatus;
  revision: number;
  reasonCode: string;
  admin: string;
};

export type ModerationIncidentItem = {
  id: string;
  createdAt: Date;
  subject: 'CUSTOMER' | 'HUMAN' | 'AGENT' | 'AUTOMATION';
  decision: string;
  categories: string[];
  status: 'PENDING' | 'IN_PROGRESS' | 'RETRY' | 'ASSESSED';
  reviewed: boolean;
  reviewDisposition: string | null;
};

export type HumanMessagingDashboard = {
  shopId: string;
  status: HumanRestrictionStatus;
  revision: number;
  reasonCode: string | null;
  updatedAt: Date | null;
  history: PageResult<HumanMessagingHistoryItem>;
  incidents: PageResult<ModerationIncidentItem>;
};
