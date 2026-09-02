import type { ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { SearchInput } from './search-input';
import { LogoutForm } from './logout-form';

export function AdminShell({
  active,
  search,
  children,
}: {
  active: 'tenants' | 'observability';
  search?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 text-gray-800">
      <Sidebar active={active} />
      <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-10 flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-8">
          <div className="w-full max-w-2xl">
            <SearchInput defaultValue={search} />
          </div>
          <div className="ml-4 w-40 shrink-0">
            <LogoutForm />
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
