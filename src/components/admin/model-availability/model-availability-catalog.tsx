import Link from "next/link";
import type {
  ModelAvailabilityAdminItem,
  ModelAvailabilityCatalogue,
  ModelAvailabilityShopCandidate,
} from "@/lib/admin/model-availability";
import { ModelAvailabilityEditor } from "./model-availability-editor";

type ModelAvailabilityCatalogProps = {
  catalogue: ModelAvailabilityCatalogue;
  canMutate: boolean;
  drawer?: string;
  availabilityId?: string;
  shopSearch: string;
  shopCandidates: ModelAvailabilityShopCandidate[];
};

function manageHref(id: string): string {
  const params = new URLSearchParams({ drawer: "manage", availabilityId: id });
  return `/commerce-models/availability?${params.toString()}`;
}

function updatedAtLabel(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusLabel(item: ModelAvailabilityAdminItem): string {
  return item.availability.enabled ? "Enabled" : "Disabled";
}

function modelCountLabel(item: ModelAvailabilityAdminItem): string {
  return `${item.modelCount} total · ${item.enabledModelCount} enabled`;
}

export function ModelAvailabilityCatalog({
  catalogue,
  canMutate,
  drawer,
  availabilityId,
  shopSearch,
  shopCandidates,
}: ModelAvailabilityCatalogProps) {
  const selected = catalogue.shops.find(
    (item) => item.availability.id === availabilityId,
  );
  const selectedManageItem =
    catalogue.platform.availability.id === availabilityId
      ? catalogue.platform
      : selected;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand-900)]">
            Model availability
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Availability controls which catalogue models may be selected for
            Platform or a Shop. It does not select the active CommerceAgent
            model.
          </p>
        </div>
        {canMutate ? (
          <Link
            href="/commerce-models/availability?drawer=create-shop"
            className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]"
          >
            Create Shop availability
          </Link>
        ) : null}
      </div>

      <section className="mb-8 rounded-md border border-gray-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-950">
              Platform Availability
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Platform catalogue eligibility available across Shops.
            </p>
          </div>
          <Link
            href={manageHref(catalogue.platform.availability.id)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Manage
          </Link>
        </div>
        <dl className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold text-gray-500">Scope</dt>
            <dd className="mt-1 text-gray-900">Platform</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-gray-500">Status</dt>
            <dd className="mt-1 text-gray-900">
              {statusLabel(catalogue.platform)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-gray-500">Models</dt>
            <dd className="mt-1 text-gray-900">
              {modelCountLabel(catalogue.platform)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-gray-500">Updated</dt>
            <dd className="mt-1 text-gray-900">
              {updatedAtLabel(catalogue.platform.updatedAt)}
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-950">
            Shop Availability
          </h2>
          <span className="text-sm text-gray-500">
            {catalogue.shops.length} Shops
          </span>
        </div>
        {catalogue.shops.length === 0 ? (
          <p className="border-y border-gray-200 py-8 text-sm text-gray-600">
            No Shop-specific model availability has been configured.
          </p>
        ) : (
          <div className="overflow-x-auto border-y border-gray-200">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold text-gray-600">
                <tr>
                  <th className="px-3 py-3">Shop</th>
                  <th className="px-3 py-3">Shop status</th>
                  <th className="px-3 py-3">Availability</th>
                  <th className="px-3 py-3">Models</th>
                  <th className="px-3 py-3">Updated</th>
                  <th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {catalogue.shops.map((item) => (
                  <tr key={item.availability.id}>
                    <td className="px-3 py-3 font-medium text-gray-900">
                      {item.shopDomain}
                    </td>
                    <td className="px-3 py-3 text-gray-700">
                      {item.shopStatus}
                    </td>
                    <td className="px-3 py-3 text-gray-700">
                      {statusLabel(item)}
                    </td>
                    <td className="px-3 py-3 text-gray-700">
                      {modelCountLabel(item)}
                    </td>
                    <td className="px-3 py-3 text-gray-700">
                      {updatedAtLabel(item.updatedAt)}
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={manageHref(item.availability.id)}
                        className="font-semibold text-[var(--brand-700)] hover:underline"
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {drawer === "create-shop" && canMutate ? (
        <ModelAvailabilityEditor
          mode="create-shop"
          candidates={shopCandidates}
          shopSearch={shopSearch}
        />
      ) : null}
      {drawer === "manage" && selectedManageItem ? (
        <ModelAvailabilityEditor
          mode="manage"
          item={selectedManageItem}
          canMutate={canMutate}
        />
      ) : null}
    </>
  );
}
