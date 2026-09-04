import type { ReactNode } from "react";
import { getPlatformAdminPrincipal } from "@/lib/auth/platform-admin";
import { getGrafanaNavigation } from "@/lib/observability/grafana";
import { Sidebar } from "./sidebar";
import { SearchInput } from "./search-input";

export async function AdminShell({
  active,
  search,
  children,
}: {
  active: "tenants" | "observability" | "queues";
  search?: string;
  children: ReactNode;
}) {
  const principal = await getPlatformAdminPrincipal();
  const grafanaNavigation = getGrafanaNavigation();
  const grafanaHref = grafanaNavigation.links[0]?.href ?? "/observability";

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 text-gray-800">
      <Sidebar
        active={active}
        administratorRole={principal?.role ?? "PLATFORM_ADMIN"}
        grafanaHref={grafanaHref}
      />
      <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-10 flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-8">
          <div className="w-full max-w-2xl">
            <SearchInput defaultValue={search} />
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
