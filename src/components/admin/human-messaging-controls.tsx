'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  changeHumanMessagingRestrictionAction,
  reviewHumanModerationAction,
} from '@/app/actions/tenant-human-messaging';
import {
  HUMAN_REASONS,
  REVIEW_DISPOSITIONS,
  type HumanActionCode,
  type HumanActionState,
  type HumanRestrictionStatus,
} from '@/lib/admin/human-messaging-contract';

const CONTROL_CLASS = 'mt-1 block w-full rounded-md border border-gray-300 bg-white p-2 text-sm';
const BUTTON_CLASS = 'rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
const MESSAGES: Record<HumanActionCode, string> = {
  UPDATED: 'Human messaging restriction saved.',
  REVIEWED: 'Review annotation saved. The original moderation decision is unchanged.',
  INVALID: 'Provide a valid reason category, internal note (1–1000 characters), and revision.',
  STALE: 'This merchant restriction was changed by another administrator. Refresh before trying again.',
  ALREADY_TARGET: 'Human messaging already has this status. No change was saved.',
  ALREADY_REVIEWED: 'This incident has already been reviewed. Refresh the list.',
  NOT_REVIEWABLE: 'Only completed moderation decisions can be reviewed.',
  NOT_FOUND: 'The merchant or incident no longer exists.',
  FORBIDDEN: 'SUPER_ADMIN access is required.',
  ERROR: 'The action could not be saved. No change was confirmed. Please try again.',
};

export function HumanMessagingRestrictionControl({ shopId, status, revision }: {
  shopId: string; status: HumanRestrictionStatus; revision: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [result, formAction, pending] = useActionState<HumanActionState, FormData>(
    changeHumanMessagingRestrictionAction, null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const intent = status === 'SUSPENDED' ? 'RESTORE' : 'SUSPEND';
  useEffect(() => {
    if (result) {
      delete formRef.current?.dataset.submitting;
      if (result.ok) router.refresh();
    }
  }, [result, router]);

  return (
    <div className="mt-4">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className={BUTTON_CLASS}>
          {intent === 'SUSPEND' ? 'Suspend human messaging' : 'Restore human messaging'}
        </button>
      ) : (
        <form ref={formRef} action={formAction} className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-4"
          onSubmitCapture={(event) => {
            if (event.currentTarget.dataset.submitting === 'true') event.preventDefault();
            else event.currentTarget.dataset.submitting = 'true';
          }}>
          <input type="hidden" name="shopId" value={shopId} />
          <input type="hidden" name="intent" value={intent} />
          <input type="hidden" name="expectedRevision" value={String(revision)} />
          <p className="text-sm font-medium text-amber-950">
            Confirm {intent === 'SUSPEND' ? 'suspension' : 'restoration'} for this merchant only.
            AI and automated recovery remain available.
          </p>
          <label className="block text-sm font-medium text-gray-900">Reason category
            <select name="reasonCode" required defaultValue="" className={CONTROL_CLASS}>
              <option value="" disabled>Select a category</option>
              {HUMAN_REASONS.map((reason) => (
                <option key={reason} value={reason}>{reason.replaceAll('_', ' ')}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-gray-900">Internal reason (required; admin-only)
            <textarea name="reasonNote" required minLength={1} maxLength={1000} rows={3} className={CONTROL_CLASS} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className={BUTTON_CLASS}>
              {pending ? 'Saving…' : `Confirm ${intent === 'SUSPEND' ? 'suspension' : 'restoration'}`}
            </button>
            <button type="button" disabled={pending} onClick={() => setOpen(false)}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 disabled:opacity-50">
              Cancel
            </button>
          </div>
        </form>
      )}
      {result ? (
        <p role={result.ok ? 'status' : 'alert'} className={`mt-2 text-sm ${result.ok ? 'text-green-700' : 'text-red-700'}`}>
          {MESSAGES[result.code]}
        </p>
      ) : null}
    </div>
  );
}

export function ModerationReviewControl({ shopId, assessmentId }: {
  shopId: string; assessmentId: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<HumanActionState, FormData>(
    reviewHumanModerationAction, null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state) {
      delete formRef.current?.dataset.submitting;
      if (state.ok) router.refresh();
    }
  }, [state, router]);
  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-center gap-2"
      onSubmitCapture={(event) => {
        if (event.currentTarget.dataset.submitting === 'true') event.preventDefault();
        else event.currentTarget.dataset.submitting = 'true';
      }}>
      <input type="hidden" name="shopId" value={shopId} />
      <input type="hidden" name="assessmentId" value={assessmentId} />
      <label className="sr-only" htmlFor={`disposition-${assessmentId}`}>Review disposition</label>
      <select id={`disposition-${assessmentId}`} name="disposition" aria-label="Review disposition"
        className="rounded-md border border-gray-300 bg-white p-1 text-xs">
        {REVIEW_DISPOSITIONS.map((disposition) => (
          <option key={disposition} value={disposition}>{disposition.replaceAll('_', ' ')}</option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold disabled:opacity-50">
        {pending ? 'Saving…' : 'Record review'}
      </button>
      {state ? <span role={state.ok ? 'status' : 'alert'} className={`text-xs ${state.ok ? 'text-green-700' : 'text-red-700'}`}>{MESSAGES[state.code]}</span> : null}
    </form>
  );
}
