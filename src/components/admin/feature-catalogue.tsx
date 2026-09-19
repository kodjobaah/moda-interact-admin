import Link from "next/link";
import { mutateFeatureCatalogueAction } from "@/app/actions/feature-catalogue";
import { AdminDetailDrawer } from "@/components/admin/admin-detail-drawer";
import { withParamUpdates } from "@/lib/admin/query";
import type { Feature } from "@prisma/client";

const inputClass =
  "mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)]";

function activationModeLabel(feature: Feature): string {
  return feature.activationMode === "ALWAYS_ENABLED"
    ? "Always enabled"
    : "Merchant opt-in";
}

function statusClasses(feature: Feature): string {
  if (feature.systemRequired) return "border-blue-200 bg-blue-50 text-blue-800";
  if (feature.active) return "border-green-200 bg-green-50 text-green-800";
  return "border-gray-200 bg-gray-100 text-gray-600";
}

function FeatureDrawer({
  feature,
  create,
  params,
}: {
  feature?: Feature;
  create: boolean;
  params: Record<string, string>;
}) {
  const closeHref = withParamUpdates("/billing", params, {
    view: "plans",
    section: "features",
    drawer: null,
    featureId: null,
  });

  return (
    <AdminDetailDrawer
      title={create ? "Create feature" : `Edit ${feature?.displayName ?? "feature"}`}
      closeHref={closeHref}
    >
      {create ? (
        <form action={mutateFeatureCatalogueAction} className="space-y-5">
          <input type="hidden" name="intent" value="create" />

          <label className="block text-sm font-medium text-gray-700">
            Key
            <input
              className={inputClass}
              name="key"
              pattern="[a-z][a-z0-9_]{0,127}"
              required
            />
            <span className="mt-1 block text-xs font-normal text-gray-500">
              Permanent machine identifier. Use lowercase letters, numbers and underscores.
            </span>
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Display name
            <input
              className={inputClass}
              name="displayName"
              maxLength={255}
              required
            />
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Activation mode
            <select
              className={inputClass}
              name="activationMode"
              defaultValue="MERCHANT_OPT_IN"
            >
              <option value="ALWAYS_ENABLED">Always enabled</option>
              <option value="MERCHANT_OPT_IN">Merchant opt-in</option>
            </select>
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Description
            <textarea
              className={inputClass}
              name="description"
              maxLength={2000}
              rows={5}
            />
          </label>

          <button
            className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]"
            type="submit"
          >
            Create feature
          </button>
        </form>
      ) : feature ? (
        <div className="space-y-6">
          <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                  Key
                </dt>
                <dd className="mt-1 font-mono text-gray-900">{feature.key}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                  Activation
                </dt>
                <dd className="mt-1 text-gray-900">{activationModeLabel(feature)}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-gray-500">
              Key and activation mode are immutable after a feature is created.
            </p>
          </section>

          {feature.systemRequired ? (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
              <p className="font-semibold">Required system feature</p>
              <p className="mt-1">This feature cannot be deactivated.</p>
            </div>
          ) : null}

          <form action={mutateFeatureCatalogueAction} className="space-y-5">
            <input type="hidden" name="intent" value="update" />
            <input type="hidden" name="id" value={feature.id} />

            <label className="block text-sm font-medium text-gray-700">
              Display name
              <input
                className={inputClass}
                name="displayName"
                defaultValue={feature.displayName}
                maxLength={255}
                required
              />
            </label>

            <label className="block text-sm font-medium text-gray-700">
              Description
              <textarea
                className={inputClass}
                name="description"
                defaultValue={feature.description ?? ""}
                maxLength={2000}
                rows={5}
              />
            </label>

            <button
              className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]"
              type="submit"
            >
              Save changes
            </button>
          </form>

          {!feature.systemRequired ? (
            <section className="border-t border-gray-200 pt-5">
              <h3 className="text-sm font-semibold text-gray-900">Availability</h3>
              <p className="mt-1 text-sm text-gray-600">
                {feature.active
                  ? "Deactivation blocks new use globally without deleting existing plan mappings or merchant preferences."
                  : "Reactivation restores eligibility wherever existing plan mappings and merchant preferences permit it."}
              </p>
              <form action={mutateFeatureCatalogueAction} className="mt-3">
                <input type="hidden" name="intent" value="toggle" />
                <input type="hidden" name="id" value={feature.id} />
                <button
                  type="submit"
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  {feature.active ? "Deactivate feature" : "Reactivate feature"}
                </button>
              </form>
            </section>
          ) : null}
        </div>
      ) : null}
    </AdminDetailDrawer>
  );
}

export function FeatureCatalogue({
  features,
  params,
}: {
  features: Feature[];
  params: Record<string, string>;
}) {
  const selectedFeature = params.featureId
    ? features.find((feature) => feature.id === params.featureId)
    : undefined;
  const createDrawerOpen = params.drawer === "create-feature";

  return (
    <>
      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-950">Feature catalogue</h2>
            <p className="mt-1 max-w-3xl text-sm text-gray-600">
              Manage dynamic feature definitions and global availability. Editing controls stay hidden until needed.
            </p>
          </div>
          <Link
            href={withParamUpdates("/billing", params, {
              view: "plans",
              section: "features",
              drawer: "create-feature",
              featureId: null,
            })}
            className="rounded-md bg-[var(--brand-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-800)]"
          >
            Create feature
          </Link>
        </div>

        {features.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {[
                    "Feature",
                    "Key",
                    "Activation",
                    "Status",
                    "Description",
                    "Action",
                  ].map((label) => (
                    <th
                      key={label}
                      className="px-5 py-3 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {features.map((feature) => (
                  <tr key={feature.id} className="align-top">
                    <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold text-gray-900">
                      {feature.displayName}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 font-mono text-xs text-gray-600">
                      {feature.key}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-700">
                      {activationModeLabel(feature)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm">
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusClasses(feature)}`}
                      >
                        {feature.systemRequired
                          ? "Required"
                          : feature.active
                            ? "Active"
                            : "Inactive"}
                      </span>
                    </td>
                    <td className="max-w-xl px-5 py-4 text-sm text-gray-600">
                      <p className="line-clamp-2">
                        {feature.description || "No description"}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm">
                      <Link
                        href={withParamUpdates("/billing", params, {
                          view: "plans",
                          section: "features",
                          featureId: feature.id,
                          drawer: null,
                        })}
                        className="font-semibold text-[var(--brand-700)] hover:underline"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-10 text-sm text-gray-500">
            No feature definitions are registered yet.
          </div>
        )}
      </section>

      {createDrawerOpen ? (
        <FeatureDrawer create params={params} />
      ) : selectedFeature ? (
        <FeatureDrawer feature={selectedFeature} create={false} params={params} />
      ) : null}
    </>
  );
}
