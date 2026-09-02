import { Icon } from './icons';

export function SearchInput({ defaultValue = '' }: { defaultValue?: string }) {
  return (
    <form action="/" method="get" className="w-full">
      <label className="sr-only" htmlFor="global-tenant-search">
        Search tenants
      </label>
      <div className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400"
        />
        <input
          id="global-tenant-search"
          name="q"
          type="search"
          defaultValue={defaultValue}
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pr-4 pl-10 text-sm transition outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-200)]"
          placeholder="Search tenants by brand name or domain..."
        />
      </div>
    </form>
  );
}
