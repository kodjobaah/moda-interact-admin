import { formatDateTime } from '@/lib/admin/format';
import type { RecoveryDetail } from '@/lib/admin/types';
import { Icon } from './icons';

export function RecoveryLifecycleTab({
  recovery,
}: {
  recovery: RecoveryDetail;
}) {
  const lifecycle = recovery.lifecycle.length
    ? recovery.lifecycle
    : [
        {
          id: 'detected',
          fromStatus: null,
          toStatus: recovery.status,
          reason: null,
          source: 'checkout',
          occurredAt: recovery.detectedAt,
        },
      ];

  return (
    <div className="relative ml-4 space-y-6 border-l-2 border-[var(--brand-200)] pt-2 pl-6">
      {lifecycle.map((event) => (
        <div key={event.id} className="relative">
          <div className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand-600)] text-white">
            <Icon name="timeline" className="h-3.5 w-3.5" />
          </div>
          <h4 className="text-sm font-bold text-gray-900">{event.toStatus}</h4>
          <p className="mt-0.5 text-xs text-gray-500">
            {event.reason ?? event.source ?? 'Recovery lifecycle update'}
          </p>
          <p className="mt-1 text-[11px] text-gray-400">
            {formatDateTime(event.occurredAt)}
          </p>
        </div>
      ))}
    </div>
  );
}
