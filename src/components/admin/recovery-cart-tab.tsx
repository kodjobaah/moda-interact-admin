import { formatMoney } from '@/lib/admin/format';
import type { RecoveryDetail } from '@/lib/admin/types';
import { EmptyState } from './empty-state';
import { Icon } from './icons';

export function RecoveryCartTab({ recovery }: { recovery: RecoveryDetail }) {
  if (!recovery.lineItems.length) {
    return (
      <EmptyState title="No cart line items">
        The stored checkout payload does not contain line-item details.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      {recovery.lineItems.map((item, index) => (
        <article
          key={`${item.title}-${index}`}
          className="flex items-center rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
        >
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-100 bg-gray-50 text-gray-300">
            {item.imageUrl ? (
              // Shopify CDN URLs are tenant data and are not known at build time, so a plain image element avoids a global remote-image allowlist.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.imageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <Icon name="box" className="h-7 w-7" />
            )}
          </div>
          <div className="ml-4 min-w-0 flex-1">
            <h4 className="truncate text-sm font-bold text-gray-900">
              {item.title}
            </h4>
            <p className="mt-1 text-xs text-gray-500">
              {item.variant ?? 'Default variant'}
            </p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500">
                Qty: {item.quantity}
              </span>
              <span className="text-sm font-bold text-gray-900">
                {formatMoney(
                  item.price,
                  item.currency ?? recovery.currency ?? 'GBP',
                )}
              </span>
            </div>
          </div>
        </article>
      ))}
      {recovery.checkoutUrl ? (
        <a
          href={recovery.checkoutUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--brand-700)] hover:text-[var(--brand-900)]"
        >
          Open checkout <Icon name="external" className="h-4 w-4" />
        </a>
      ) : null}
    </div>
  );
}
