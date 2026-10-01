import Link from "next/link";
import { mutateModelAvailabilityAction } from "@/app/actions/model-availability";
import { AdminDetailDrawer } from "@/components/admin/admin-detail-drawer";
import type {
  ModelAvailabilityAdminItem,
  ModelAvailabilityShopCandidate,
} from "@/lib/admin/model-availability";
import { ModelAvailabilitySubmitButton } from "./model-availability-submit-button";

const inputClass =
  "mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)]";

type ModelAvailabilityEditorProps =
  | {
      mode: "create-shop";
      candidates: ModelAvailabilityShopCandidate[];
      shopSearch: string;
    }
  | {
      mode: "manage";
      item: ModelAvailabilityAdminItem;
      canMutate: boolean;
    };

export function ModelAvailabilityEditor(props: ModelAvailabilityEditorProps) {
  if (props.mode === "create-shop") {
    return (
      <AdminDetailDrawer
        title="Create Shop availability"
        closeHref="/commerce-models/availability"
      >
        <div className="space-y-5">
          <p className="text-sm text-gray-600">
            Create one Shop-scoped Availability for an existing Shop. Search
            requires at least 2 characters.
          </p>
          <form
            method="get"
            action="/commerce-models/availability"
            className="flex flex-col gap-3 sm:flex-row"
          >
            <input type="hidden" name="drawer" value="create-shop" />
            <label className="min-w-0 flex-1 text-sm font-medium text-gray-700">
              Shop domain
              <input
                className={inputClass}
                name="shopSearch"
                defaultValue={props.shopSearch}
                maxLength={120}
                autoComplete="off"
              />
            </label>
            <button
              className="self-end rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
              type="submit"
            >
              Search Shops
            </button>
          </form>
          {props.shopSearch.trim().length < 2 ? (
            <p className="border-y border-gray-200 py-4 text-sm text-gray-600">
              Enter at least 2 search characters to find Shops without Model
              Availability.
            </p>
          ) : props.candidates.length === 0 ? (
            <p className="border-y border-gray-200 py-4 text-sm text-gray-600">
              No Shops without Model Availability match this search.
            </p>
          ) : (
            <ul className="divide-y divide-gray-200">
              {props.candidates.map((candidate) => (
                <li key={candidate.id} className="py-4">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-gray-900">
                      {candidate.domain}
                    </span>
                    <span className="text-xs text-gray-500">
                      {candidate.status}
                    </span>
                  </div>
                  <form
                    action={mutateModelAvailabilityAction}
                    className="space-y-3"
                  >
                    <input type="hidden" name="intent" value="create-shop" />
                    <input type="hidden" name="shopId" value={candidate.id} />
                    <label className="block text-sm font-medium text-gray-700">
                      Audit reason
                      <input
                        className={inputClass}
                        name="reason"
                        maxLength={1000}
                        required
                      />
                    </label>
                    <ModelAvailabilitySubmitButton
                      idleLabel="Create availability"
                      pendingLabel="Creating…"
                    />
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      </AdminDetailDrawer>
    );
  }

  const { item, canMutate } = props;
  const { availability } = item;
  const actionLabel = availability.enabled
    ? "Disable availability"
    : "Enable availability";
  const pendingLabel = availability.enabled ? "Disabling…" : "Enabling…";
  const warning = availability.enabled
    ? availability.scope === "PLATFORM"
      ? "Disabling Platform availability removes Platform catalogue models from every Shop's effective available set. Existing Agent model selections are not rewritten."
      : "Disabling this Shop availability removes its private catalogue models from this Shop's effective available set. Existing Agent model selections are not rewritten."
    : null;

  return (
    <AdminDetailDrawer
      title="Manage Model Availability"
      closeHref="/commerce-models/availability"
    >
      <div className="space-y-6">
        <dl className="grid gap-4 border-b border-gray-200 pb-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold text-gray-500">
              Availability id
            </dt>
            <dd className="mt-1 break-all font-mono text-gray-900">
              {availability.id}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-gray-500">Scope</dt>
            <dd className="mt-1 text-gray-900">
              {availability.scope === "PLATFORM" ? "Platform" : "Shop"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-gray-500">Shop</dt>
            <dd className="mt-1 text-gray-900">
              {item.shopDomain ?? "Platform"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-gray-500">Status</dt>
            <dd className="mt-1 text-gray-900">
              {availability.enabled ? "Enabled" : "Disabled"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-gray-500">
              Model counts
            </dt>
            <dd className="mt-1 text-gray-900">
              {item.modelCount} total · {item.enabledModelCount} enabled
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-gray-500">
              Edit version
            </dt>
            <dd className="mt-1 text-gray-900">{availability.editVersion}</dd>
          </div>
        </dl>

        {canMutate ? (
          <section className="space-y-4">
            {warning ? (
              <p className="border-l-2 border-amber-400 pl-3 text-sm text-gray-700">
                {warning}
              </p>
            ) : null}
            <form action={mutateModelAvailabilityAction} className="space-y-4">
              <input type="hidden" name="intent" value="set-enabled" />
              <input type="hidden" name="id" value={availability.id} />
              <input
                type="hidden"
                name="expectedEditVersion"
                value={availability.editVersion}
              />
              <input
                type="hidden"
                name="enabled"
                value={String(!availability.enabled)}
              />
              <label className="block text-sm font-medium text-gray-700">
                Audit reason
                <textarea
                  className={inputClass}
                  name="reason"
                  maxLength={1000}
                  rows={3}
                  required
                />
              </label>
              <ModelAvailabilitySubmitButton
                idleLabel={actionLabel}
                pendingLabel={pendingLabel}
              />
            </form>
          </section>
        ) : null}
        <Link
          href="/commerce-models/availability"
          className="inline-flex text-sm font-medium text-[var(--brand-700)] hover:underline"
        >
          Back to availability
        </Link>
      </div>
    </AdminDetailDrawer>
  );
}
