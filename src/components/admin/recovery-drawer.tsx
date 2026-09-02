import Link from 'next/link';
import { formatMoney } from '@/lib/admin/format';
import { withParamUpdates } from '@/lib/admin/query';
import type { RecoveryDetail } from '@/lib/admin/types';
import { Icon } from './icons';
import { RecoveryCartTab } from './recovery-cart-tab';
import { RecoveryConversationTab } from './recovery-conversation-tab';
import { RecoveryDrawerTabLink } from './recovery-drawer-tab-link';
import { RecoveryLifecycleTab } from './recovery-lifecycle-tab';
import { StatusBadge } from './status-badge';

export type DrawerTab = 'conversation' | 'cart' | 'lifecycle';

export function RecoveryDrawer({
  recovery,
  tab,
  params,
}: {
  recovery: RecoveryDetail;
  tab: DrawerTab;
  params: Record<string, string>;
}) {
  const closeHref = withParamUpdates('/', params, {
    recoveryId: null,
    drawerTab: null,
    messagePage: null,
  });

  return (
    <>
      <Link
        href={closeHref}
        aria-label="Close recovery details"
        className="fixed inset-0 z-40 bg-gray-900/30"
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[470px] flex-col border-l border-gray-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-200 bg-gray-50 px-6 py-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              Customer Details
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              {recovery.customer?.name ?? 'Unknown customer'} ·{' '}
              {recovery.customer?.phone ??
                recovery.customer?.email ??
                'No contact'}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <span className="text-2xl font-bold text-gray-900">
                {formatMoney(recovery.totalPrice, recovery.currency ?? 'GBP')}
              </span>
              <StatusBadge value={recovery.outcome ?? recovery.status} />
            </div>
          </div>
          <Link
            href={closeHref}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-gray-500 transition hover:bg-gray-300 hover:text-gray-700"
            aria-label="Close"
          >
            <Icon name="close" className="h-4 w-4" />
          </Link>
        </div>

        <nav
          className="flex gap-5 border-b border-gray-200 px-6"
          aria-label="Recovery detail tabs"
        >
          <RecoveryDrawerTabLink
            label="Conversation"
            value="conversation"
            current={tab}
            params={params}
          />
          <RecoveryDrawerTabLink
            label={`Cart Details (${recovery.lineItems.length})`}
            value="cart"
            current={tab}
            params={params}
          />
          <RecoveryDrawerTabLink
            label="Lifecycle"
            value="lifecycle"
            current={tab}
            params={params}
          />
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto bg-white p-6">
          {tab === 'conversation' ? (
            <RecoveryConversationTab recovery={recovery} params={params} />
          ) : null}
          {tab === 'cart' ? <RecoveryCartTab recovery={recovery} /> : null}
          {tab === 'lifecycle' ? (
            <RecoveryLifecycleTab recovery={recovery} />
          ) : null}
        </div>
      </aside>
    </>
  );
}
