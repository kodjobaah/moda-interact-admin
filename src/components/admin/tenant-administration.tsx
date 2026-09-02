import { updateTenantAction } from '@/app/actions/tenant';
import { formatDateTime } from '@/lib/admin/format';
import type { TenantDetail } from '@/lib/admin/types';

export function TenantAdministration({
  tenant,
  returnTo,
  saved,
}: {
  tenant: TenantDetail;
  returnTo: string;
  saved?: boolean;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h4 className="mb-3 text-xs font-bold tracking-wider text-gray-400 uppercase">
          Shopify Lifecycle &amp; Status
        </h4>
        <form action={updateTenantAction} className="space-y-4">
          <input type="hidden" name="shopId" value={tenant.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <div>
            <label
              className="mb-1 block text-xs font-medium text-gray-600"
              htmlFor={`status-${tenant.id}`}
            >
              Shop Status
            </label>
            <select
              id={`status-${tenant.id}`}
              name="status"
              defaultValue={tenant.status}
              className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)]"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="SUSPENDED">SUSPENDED</option>
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className="block text-xs font-medium text-gray-500">
                Installed At
              </span>
              <p className="mt-0.5 text-sm font-medium text-gray-900">
                {formatDateTime(tenant.installedAt)}
              </p>
            </div>
            <div>
              <span className="block text-xs font-medium text-gray-500">
                Uninstalled At
              </span>
              <p className="mt-0.5 text-sm font-medium text-gray-900">
                {formatDateTime(tenant.uninstalledAt)}
              </p>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <label
              className="mb-1 block text-xs font-medium text-gray-600"
              htmlFor={`delay-${tenant.id}`}
            >
              Recovery Delay (Minutes)
            </label>
            <input
              id={`delay-${tenant.id}`}
              name="recoveryDelayMinutes"
              type="number"
              min={0}
              max={10080}
              defaultValue={tenant.recoveryDelayMinutes ?? 30}
              className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)]"
            />
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 pt-3">
            <span className="text-xs text-green-700" aria-live="polite">
              {saved ? 'Changes saved successfully.' : ''}
            </span>
            <button
              type="submit"
              className="rounded-md bg-[var(--brand-700)] px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--brand-800)]"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h4 className="mb-3 text-xs font-bold tracking-wider text-gray-400 uppercase">
          Billing &amp; Onboarding
        </h4>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-gray-500">Plan</dt>
            <dd className="mt-1 text-sm font-semibold text-gray-900">
              {tenant.planName ?? tenant.planHandle ?? 'No plan'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">
              Subscription Status
            </dt>
            <dd className="mt-1 text-sm font-semibold text-gray-900">
              {tenant.subscriptionStatus ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">
              Current Period Start
            </dt>
            <dd className="mt-1 text-sm font-semibold text-gray-900">
              {formatDateTime(tenant.currentPeriodStart)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">
              Current Period End
            </dt>
            <dd className="mt-1 text-sm font-semibold text-gray-900">
              {formatDateTime(tenant.currentPeriodEnd)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">Onboarding</dt>
            <dd className="mt-1 text-sm font-semibold text-gray-900">
              {tenant.onboardingCompleted ? 'Completed' : 'Incomplete'}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
