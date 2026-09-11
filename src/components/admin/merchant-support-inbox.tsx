'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState, useTransition } from 'react';
import {
  AuthoredSupportBodySchema,
  countUnicodeGraphemes,
} from '@modainteract/moda-interact-shared/merchant-communications';
import {
  composeAdministrativeMessageAction,
  getMerchantSupportShopSuggestionsAction,
  releaseMerchantSupportThreadOwnershipAction,
  reassignMerchantSupportThreadOwnershipAction,
  requestAdditionalTranslationAction,
  requestTranslationReconciliationAction,
  requestFailedTranslationsReconciliationAction,
  takeMerchantSupportThreadOwnershipAction,
} from '@/app/actions/merchant-support';
import { createBillingTriageActionAction } from '@/app/actions/billing-lifecycle';
import { Pagination } from './pagination';
import { Icon } from './icons';
import { adminI18n, adminStatusLabel } from '@/i18n';
import type { PlatformAdminPrincipal } from '@/lib/auth/platform-admin';
import type {
  MerchantSupportShopSuggestion,
  MerchantSupportThreadDetail,
  PendingSupportFilter,
} from '@/lib/admin/merchant-support';
import type { BillingSupportContext, BillingTriageAction } from '@/lib/admin/billing-lifecycle';
import { tenantName } from '@/lib/admin/format';
import { withParamUpdates } from '@/lib/admin/query';

type PendingData = {
  items: Array<{
    id: string;
    shopId: string;
    domain: string;
    assignedPlatformAdminId: string | null;
    owner: { id: string; displayName: string | null; email: string } | null;
    needsAdminResponse: true;
    lastMerchantMessageAt: Date | null;
  }>;
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

type Props = {
  principal: PlatformAdminPrincipal;
  pending: PendingData;
  thread: MerchantSupportThreadDetail | null;
  billingContext: BillingSupportContext | null;
  filter: PendingSupportFilter;
  search: string;
  params: Record<string, string>;
};

const filterLabels: Record<PendingSupportFilter, string> = {
  all: 'All pending',
  unassigned: 'Unassigned',
  'assigned-to-me': 'Assigned to me',
  'assigned-to-others': 'Assigned to others',
};

const SUPPORTED_TRANSLATION_LANGUAGE_OPTIONS = [
  { value: 'cs', label: 'Czech' },
  { value: 'da', label: 'Danish' },
  { value: 'de', label: 'German' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fi', label: 'Finnish' },
  { value: 'fr', label: 'French' },
  { value: 'it', label: 'Italian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'nb', label: 'Norwegian Bokmål' },
  { value: 'nl', label: 'Dutch' },
  { value: 'pl', label: 'Polish' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)' },
  { value: 'pt-PT', label: 'Portuguese (Portugal)' },
  { value: 'sv', label: 'Swedish' },
  { value: 'th', label: 'Thai' },
  { value: 'tr', label: 'Turkish' },
  { value: 'zh-Hans', label: 'Chinese (Simplified)' },
  { value: 'zh-Hant', label: 'Chinese (Traditional)' },
] as const;

export function MerchantSupportInbox({ principal, pending, thread, billingContext, filter, search, params }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState(search);
  const [suggestions, setSuggestions] = useState<MerchantSupportShopSuggestion[]>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const suggestionRequestSequence = useRef(0);

  useEffect(() => {
    const query = searchValue.trim();
    const requestSequence = ++suggestionRequestSequence.current;
    if (query.length < 2) {
      return;
    }
    const timeout = window.setTimeout(async () => {
      try {
        const result = await getMerchantSupportShopSuggestionsAction({ query });
        if (requestSequence === suggestionRequestSequence.current) {
          setSuggestions(result.slice(0, 8));
          setActiveSuggestionIndex(-1);
        }
      } catch {
        if (requestSequence === suggestionRequestSequence.current) setSuggestions([]);
      }
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [searchValue]);

  function runAction(action: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : 'The action could not be completed.');
      }
    });
  }

  const queryParams = { ...params, filter, ...(search ? { search } : {}) };
  const globalReconcile = () => runAction(() => requestFailedTranslationsReconciliationAction());
  function selectSuggestion(suggestion: MerchantSupportShopSuggestion) {
    suggestionRequestSequence.current += 1;
    setSuggestions([]);
    setActiveSuggestionIndex(-1);
    router.push(withParamUpdates('/merchant-support', params, {
      thread: suggestion.threadId,
      page: 1,
      search: null,
    }));
  }

  return (
    <div className="mx-auto max-w-[1500px]">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--brand-700)]">Operations</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--brand-900)]">Merchant Messages</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-500">Review pending merchant support threads, ownership, translations, and durable recovery requests.</p>
        </div>
        {principal.role === 'SUPER_ADMIN' ? (
          <button type="button" onClick={globalReconcile} disabled={isPending} className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50">
            Reconcile failed translations
          </button>
        ) : null}
      </header>

      {error ? <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.5fr)]">
        <section aria-labelledby="pending-support-heading" className="min-w-0 overflow-hidden rounded-xl border border-[var(--brand-200)] bg-white shadow-sm">
          <div className="border-b border-gray-100 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="pending-support-heading" className="font-semibold text-[var(--brand-900)]">Pending support</h2>
                <p className="mt-1 text-xs text-gray-500">{pending.totalItems} threads require an administrative response.</p>
              </div>
              <Icon name="message" className="h-5 w-5 text-[var(--brand-600)]" />
            </div>
            <form action="/merchant-support" className="relative mt-4 flex gap-2">
              <label htmlFor="support-search" className="sr-only">Search pending shops</label>
              <input
                id="support-search"
                name="search"
                value={searchValue}
                onChange={(event) => {
                  const value = event.target.value;
                  setSearchValue(value);
                  if (value.trim().length < 2) {
                    suggestionRequestSequence.current += 1;
                    setSuggestions([]);
                    setActiveSuggestionIndex(-1);
                  }
                }}
                onBlur={() => window.setTimeout(() => { setSuggestions([]); setActiveSuggestionIndex(-1); }, 0)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown' && suggestions.length) {
                    event.preventDefault();
                    setActiveSuggestionIndex((index) => (index + 1) % suggestions.length);
                  } else if (event.key === 'ArrowUp' && suggestions.length) {
                    event.preventDefault();
                    setActiveSuggestionIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    suggestionRequestSequence.current += 1;
                    setSuggestions([]);
                    setActiveSuggestionIndex(-1);
                  } else if (event.key === 'Enter' && activeSuggestionIndex >= 0) {
                    event.preventDefault();
                    selectSuggestion(suggestions[activeSuggestionIndex]);
                  }
                }}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={suggestions.length > 0}
                aria-controls={suggestions.length ? 'support-search-suggestions' : undefined}
                aria-activedescendant={activeSuggestionIndex >= 0 ? `support-suggestion-${suggestions[activeSuggestionIndex].threadId}` : undefined}
                placeholder="Search shop or brand"
                className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <input type="hidden" name="filter" value={filter} />
              <button type="submit" className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Search</button>
              {suggestions.length ? <ul id="support-search-suggestions" role="listbox" className="absolute left-0 right-16 top-full z-10 mt-1 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
                {suggestions.map((suggestion, index) => <li key={suggestion.threadId} id={`support-suggestion-${suggestion.threadId}`} role="option" aria-selected={index === activeSuggestionIndex}>
                  <button type="button" className={`block w-full px-3 py-2 text-left text-sm ${index === activeSuggestionIndex ? 'bg-[var(--brand-50)]' : 'hover:bg-gray-50'}`} onMouseDown={(event) => event.preventDefault()} onClick={() => selectSuggestion(suggestion)}>
                    <span className="block font-semibold text-[var(--brand-900)]">{tenantName(suggestion.brandName, suggestion.domain)}</span>
                    <span className="block text-xs text-gray-500">{suggestion.domain}{suggestion.needsAdminResponse ? ' · Pending response' : ''}</span>
                  </button>
                </li>)}
              </ul> : null}
            </form>
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Pending support filters">
              {Object.entries(filterLabels).map(([value, label]) => (
                <Link key={value} href={withParamUpdates('/merchant-support', params, { filter: value, page: 1, thread: null })} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === value ? 'bg-[var(--brand-800)] text-white' : 'bg-[var(--brand-100)] text-[var(--brand-800)] hover:bg-[var(--brand-200)]'}`}>
                  {label}
                </Link>
              ))}
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {pending.items.length === 0 ? <p className="p-6 text-sm text-gray-500">No pending support threads match this view.</p> : pending.items.map((item) => (
              <Link key={item.id} href={withParamUpdates('/merchant-support', params, { thread: item.id })} className={`block p-4 hover:bg-[var(--brand-50)] ${thread?.thread.id === item.id ? 'bg-[var(--brand-100)]' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <strong className="truncate text-sm text-[var(--brand-900)]">{item.domain}</strong>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${item.owner ? 'bg-blue-50 text-blue-800' : 'bg-amber-50 text-amber-800'}`}>{item.owner ? 'Assigned' : 'Unassigned'}</span>
                </div>
                <p className="mt-2 text-xs text-gray-500">{item.owner ? item.owner.displayName || item.owner.email : 'No owner'} · {item.lastMerchantMessageAt ? adminI18n.formatDateTime(item.lastMerchantMessageAt) : 'No recent activity'}</p>
              </Link>
            ))}
          </div>
          <Pagination pathname="/merchant-support" params={queryParams} page={pending.page} totalPages={pending.totalPages} totalItems={pending.totalItems} pageParam="page" countKey="pagination.messages" resetParams={['thread']} />
        </section>

        <section aria-labelledby="support-thread-heading" className="min-w-0 rounded-xl border border-[var(--brand-200)] bg-white shadow-sm">
          {thread ? <ThreadPanel thread={thread} principal={principal} runAction={runAction} isPending={isPending} billingContext={billingContext} /> : <div className="flex min-h-[420px] items-center justify-center p-8 text-center"><div><Icon name="message" className="mx-auto h-10 w-10 text-[var(--brand-300)]" /><h2 className="mt-4 font-semibold text-[var(--brand-900)]">Select a support thread</h2><p className="mt-2 max-w-sm text-sm text-gray-500">Choose a pending shop to review its bounded support history and ownership state.</p></div></div>}
        </section>
      </div>
    </div>
  );
}

function ThreadPanel({ thread, principal, runAction, isPending, billingContext }: { thread: MerchantSupportThreadDetail; principal: PlatformAdminPrincipal; runAction: (action: () => Promise<unknown>) => void; isPending: boolean; billingContext: BillingSupportContext | null }) {
  const ownerId = thread.thread.assignedPlatformAdminId;
  const isOwner = ownerId === principal.id;
  const canRelease = isOwner || principal.role === 'SUPER_ADMIN';

  return (
    <div>
      <div className="border-b border-gray-100 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--brand-700)]">Support thread</p>
            <h2 id="support-thread-heading" className="mt-1 text-xl font-bold text-[var(--brand-900)]">{thread.thread.domain}</h2>
            <p className="mt-1 text-sm text-gray-500">{thread.thread.needsAdminResponse ? 'Response required' : 'No response currently required'} · {thread.thread.messageCount} messages</p>
          </div>
          <OwnershipControls threadId={thread.thread.id} ownerId={ownerId} principal={principal} canRelease={canRelease} runAction={runAction} isPending={isPending} />
        </div>
      </div>
      {billingContext ? <BillingTriagePanel context={billingContext} thread={thread} runAction={runAction} isPending={isPending} /> : null}
      <ol className="max-h-[620px] space-y-4 overflow-auto p-5" aria-label="Support message history">
        {thread.messages.map((message) => <SupportMessage key={message.id} message={message} runAction={runAction} isPending={isPending} />)}
      </ol>
      <ComposeBox threadId={thread.thread.id} enabled={isOwner} runAction={runAction} isPending={isPending} />
    </div>
  );
}

function BillingTriagePanel({ context, thread, runAction, isPending }: { context: BillingSupportContext; thread: MerchantSupportThreadDetail; runAction: (action: () => Promise<unknown>) => void; isPending: boolean }) {
  const [action, setAction] = useState<BillingTriageAction>('PLAN_CHANGE');
  const [purchaseId, setPurchaseId] = useState('');
  const [reason, setReason] = useState('');
  const latestMerchantMessage = [...thread.messages].reverse().find((message) => message.kind === 'MERCHANT');
  const requiresPurchase = action === 'RECOVERY_CREDIT_REFUND';
  return (
    <section aria-labelledby="billing-triage-heading" className="border-b border-gray-100 bg-amber-50/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="billing-triage-heading" className="font-semibold text-[var(--brand-900)]">{adminI18n.t('billingTriage.title')}</h2>
          <p className="mt-1 text-xs text-gray-600">{adminI18n.t('billingTriage.availability', { count: context.purchasedCredits.available })}</p>
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-gray-700">{context.domain}</span>
      </div>
      <form className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_2fr_auto]" onSubmit={(event) => {
        event.preventDefault();
        if (!latestMerchantMessage || (requiresPurchase && !purchaseId)) return;
        runAction(() => createBillingTriageActionAction({ threadId: thread.thread.id, messageId: latestMerchantMessage.id, action, reason, purchaseId: requiresPurchase ? purchaseId : undefined }));
      }}>
        <label className="text-xs font-semibold text-gray-700">{adminI18n.t('billingTriage.action')}
          <select value={action} onChange={(event) => setAction(event.target.value as BillingTriageAction)} className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm">
            <option value="PLAN_CHANGE">{adminI18n.t('billingTriage.planChange')}</option>
            <option value="SUBSCRIPTION_CANCELLATION">{adminI18n.t('billingTriage.cancellation')}</option>
            <option value="RECOVERY_CREDIT_REFUND">{adminI18n.t('billingTriage.refund')}</option>
          </select>
        </label>
        {requiresPurchase ? <label className="text-xs font-semibold text-gray-700">{adminI18n.t('billingTriage.purchase')}
          <select value={purchaseId} onChange={(event) => setPurchaseId(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm">
            <option value="">{adminI18n.t('billingTriage.selectPurchase')}</option>
            {context.purchases.filter((purchase) => purchase.status === 'ACTIVE').map((purchase) => <option key={purchase.id} value={purchase.id}>{purchase.id.slice(0, 12)} · {purchase.credits} credits</option>)}
          </select>
        </label> : <div />}
        <label className="text-xs font-semibold text-gray-700">{adminI18n.t('billingTriage.reason')}
          <input required minLength={1} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm" />
        </label>
        <button type="submit" disabled={isPending || !latestMerchantMessage || (requiresPurchase && !purchaseId)} className="self-end rounded-md bg-[var(--brand-800)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{adminI18n.t('billingTriage.submit')}</button>
      </form>
    </section>
  );
}

function OwnershipControls({ threadId, ownerId, principal, canRelease, runAction, isPending }: { threadId: string; ownerId: string | null; principal: PlatformAdminPrincipal; canRelease: boolean; runAction: (action: () => Promise<unknown>) => void; isPending: boolean }) {
  const [targetAdminId, setTargetAdminId] = useState('');
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
      <span className="rounded-full bg-gray-100 px-3 py-1.5 text-gray-700">{ownerId ? `Owner: ${ownerId}` : 'Unassigned'}</span>
      {!ownerId ? <button type="button" onClick={() => runAction(() => takeMerchantSupportThreadOwnershipAction({ threadId }))} disabled={isPending} className="rounded-md bg-[var(--brand-800)] px-3 py-2 font-semibold text-white disabled:opacity-50">Take</button> : null}
      {canRelease ? <button type="button" onClick={() => runAction(() => releaseMerchantSupportThreadOwnershipAction({ threadId }))} disabled={isPending} className="rounded-md border border-gray-300 bg-white px-3 py-2 font-semibold text-gray-700 disabled:opacity-50">Release</button> : null}
      {principal.role === 'SUPER_ADMIN' ? <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (targetAdminId.trim()) runAction(() => reassignMerchantSupportThreadOwnershipAction({ threadId, targetPlatformAdminId: targetAdminId.trim() })); }}><label htmlFor={`reassign-${threadId}`} className="sr-only">Active administrator ID</label><input id={`reassign-${threadId}`} value={targetAdminId} onChange={(event) => setTargetAdminId(event.target.value)} placeholder="Admin ID" className="w-28 rounded-md border border-gray-300 px-2 py-2 text-xs" /><button type="submit" disabled={isPending || !targetAdminId.trim()} className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 disabled:opacity-50">Reassign</button></form> : null}
    </div>
  );
}

function SupportMessage({ message, runAction, isPending }: { message: MerchantSupportThreadDetail['messages'][number]; runAction: (action: () => Promise<unknown>) => void; isPending: boolean }) {
  const [selectedTranslationId, setSelectedTranslationId] = useState<string | null>(null);
  const [languageSelection, setLanguageSelection] = useState('');
  const selectedTranslation = message.translations.find((translation) => translation.id === selectedTranslationId) ?? null;
  const targetLanguageTag = languageSelection;
  const label = message.kind === 'MERCHANT' ? 'Merchant' : message.kind === 'SYSTEM' ? 'System' : 'Moda Support';
  const readLabel = message.kind === 'MERCHANT'
    ? message.readAt ? 'Read by support' : 'Unread by support'
    : message.readAt ? 'Read by merchant' : 'Unread by merchant';
  return (
    <li className={`rounded-lg border p-4 ${message.kind === 'MERCHANT' ? 'border-blue-200 bg-blue-50/60' : message.kind === 'SYSTEM' ? 'border-amber-200 bg-amber-50/60' : 'border-[var(--brand-200)] bg-white'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><strong className="text-sm text-[var(--brand-900)]">{label}</strong><span className="rounded-full bg-white/80 px-2 py-1 text-[11px] font-semibold text-gray-600">{message.kind}</span></div><time className="text-xs text-gray-500" dateTime={message.createdAt.toISOString()}>{adminI18n.formatDateTime(message.createdAt)}</time></div>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm text-gray-800">{selectedTranslation?.status === 'AVAILABLE' && selectedTranslation.translatedBody ? selectedTranslation.translatedBody : message.originalBody}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full px-2 py-1 font-semibold ${message.state === 'AVAILABLE' ? 'bg-emerald-50 text-emerald-800' : message.state === 'FAILED' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}>{adminStatusLabel(message.state)}</span>
        <span className="text-gray-500">{readLabel}</span>
        {selectedTranslation ? <span className="text-gray-500">Translation {selectedTranslation.status.toLowerCase()}</span> : null}
        <button type="button" onClick={() => setSelectedTranslationId(null)} disabled={!selectedTranslationId} className="font-semibold text-[var(--brand-700)] underline disabled:opacity-50">View original</button>
        {message.translations.map((translation) => (
          <span key={translation.id} className="flex items-center gap-1">
            {translation.status === 'AVAILABLE' ? <button type="button" onClick={() => setSelectedTranslationId(translation.id)} className="font-semibold text-[var(--brand-700)] underline">{translation.targetLanguageTag}</button> : <span className="text-gray-500">{translation.targetLanguageTag}: {translation.status.toLowerCase()}</span>}
            {translation.status === 'FAILED' ? <button type="button" onClick={() => runAction(() => requestTranslationReconciliationAction({ translationId: translation.id }))} disabled={isPending} className="font-semibold text-red-700 underline disabled:opacity-50">Retry / Reconcile</button> : null}
          </span>
        ))}
        <form className="ml-auto flex flex-wrap items-center justify-end gap-2" onSubmit={(event) => { event.preventDefault(); if (targetLanguageTag) runAction(() => requestAdditionalTranslationAction({ messageId: message.id, targetLanguageTag })); }}>
          <label htmlFor={`translation-${message.id}`} className="sr-only">Additional translation language</label>
          <select id={`translation-${message.id}`} value={languageSelection} onChange={(event) => setLanguageSelection(event.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-xs">
            <option value="">Select language…</option>
            {SUPPORTED_TRANSLATION_LANGUAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <button type="submit" disabled={isPending || !targetLanguageTag} className="font-semibold text-[var(--brand-700)] underline disabled:opacity-50">Translate</button>
        </form>
      </div>
    </li>
  );
}

function ComposeBox({ threadId, enabled, runAction, isPending }: { threadId: string; enabled: boolean; runAction: (action: () => Promise<unknown>) => void; isPending: boolean }) {
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const count = countUnicodeGraphemes(body);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = AuthoredSupportBodySchema.safeParse(body);
    if (!result.success) { setError('Message must contain between 1 and 500 graphemes.'); return; }
    setError(null);
    runAction(async () => { await composeAdministrativeMessageAction({ threadId, body }); setBody(''); });
  }
  return (
    <form onSubmit={submit} className="border-t border-gray-100 bg-gray-50 p-5">
      <div className="flex items-center justify-between gap-3"><label htmlFor="admin-support-compose" className="text-sm font-semibold text-[var(--brand-900)]">Compose administrative reply</label><span aria-live="polite" className="text-xs text-gray-500">{count}/500 graphemes</span></div>
      {!enabled ? <p className="mt-2 text-xs text-amber-800">Only the current owner can send. Take or receive ownership before composing.</p> : null}
      <textarea id="admin-support-compose" value={body} onChange={(event) => setBody(event.target.value)} disabled={!enabled || isPending} className="mt-3 min-h-28 w-full rounded-md border border-gray-300 bg-white p-3 text-sm disabled:bg-gray-100" aria-describedby="admin-compose-error" />
      {error ? <p id="admin-compose-error" role="alert" className="mt-2 text-xs text-red-700">{error}</p> : null}
      <button type="submit" disabled={!enabled || isPending} className="mt-3 rounded-md bg-[var(--brand-800)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{isPending ? 'Working…' : 'Send message'}</button>
    </form>
  );
}
