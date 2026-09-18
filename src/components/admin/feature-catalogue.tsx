import { mutateFeatureCatalogueAction } from "@/app/actions/feature-catalogue";
import type { Feature } from "@prisma/client";

const inputClass = "w-full rounded-md border border-gray-300 bg-white p-2 text-sm";

export function FeatureCatalogue({ features }: { features: Feature[] }) {
  return (
    <section className="space-y-5 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-gray-950">Feature catalogue</h2>
        <p className="mt-1 text-sm text-gray-600">Manage dynamic feature definitions and global availability.</p>
      </div>
      <form action={mutateFeatureCatalogueAction} className="grid gap-3 rounded-md border border-gray-200 bg-gray-50 p-4 sm:grid-cols-4">
        <input type="hidden" name="intent" value="create" />
        <label className="text-sm font-medium text-gray-700">Key<input className={inputClass} name="key" pattern="[a-z][a-z0-9_]{0,127}" required /></label>
        <label className="text-sm font-medium text-gray-700">Display name<input className={inputClass} name="displayName" maxLength={255} required /></label>
        <label className="text-sm font-medium text-gray-700">Activation mode<select className={inputClass} name="activationMode" defaultValue="MERCHANT_OPT_IN"><option value="ALWAYS_ENABLED">ALWAYS_ENABLED</option><option value="MERCHANT_OPT_IN">MERCHANT_OPT_IN</option></select></label>
        <label className="text-sm font-medium text-gray-700 sm:col-span-4">Description<textarea className={inputClass} name="description" maxLength={2000} rows={2} /></label>
        <button className="rounded-md bg-[var(--brand-700)] px-3 py-2 text-sm font-semibold text-white sm:col-span-4 sm:w-fit" type="submit">Create feature</button>
      </form>
      <div className="space-y-3">
        {features.map((feature) => (
          <article key={feature.id} className="rounded-md border border-gray-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="font-semibold text-gray-950">{feature.displayName}</h3><p className="font-mono text-xs text-gray-500">{feature.key}</p></div>
              <span className="text-xs font-semibold text-gray-600">{feature.systemRequired ? "Required" : feature.active ? "Active" : "Inactive"}</span>
            </div>
            <form action={mutateFeatureCatalogueAction} className="mt-3 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="intent" value="update" /><input type="hidden" name="id" value={feature.id} />
              <label className="text-sm font-medium text-gray-700">Display name<input className={inputClass} name="displayName" defaultValue={feature.displayName} maxLength={255} required /></label>
              <label className="text-sm font-medium text-gray-700">Description<textarea className={inputClass} name="description" defaultValue={feature.description ?? ""} maxLength={2000} rows={2} /></label>
              <button className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 sm:w-fit" type="submit">Save details</button>
            </form>
            <form action={mutateFeatureCatalogueAction} className="mt-2">
              <input type="hidden" name="intent" value="toggle" /><input type="hidden" name="id" value={feature.id} />
              <button type="submit" disabled={feature.systemRequired} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 disabled:cursor-not-allowed disabled:text-gray-400">{feature.active ? "Deactivate" : "Reactivate"}</button>
            </form>
          </article>
        ))}
      </div>
    </section>
  );
}
