import Image from "next/image";
import Link from "next/link";
import { Icon } from "./icons";
import { LogoutForm } from "./logout-form";

function roleLabel(role: string) {
  return role
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function Sidebar({
  active,
  administratorRole,
  grafanaHref,
}: {
  active: "tenants" | "observability" | "queues";
  administratorRole: string;
  grafanaHref: string;
}) {
  const base =
    "flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium transition-colors";
  const selected =
    "border border-[var(--brand-200)] bg-white text-[var(--brand-900)] shadow-sm";
  const idle = "text-[var(--brand-800)] hover:bg-white/60";
  const observabilityActive = active === "observability" || active === "queues";

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--brand-200)] bg-[var(--brand-100)] md:flex">
      <div className="flex h-20 items-center border-b border-[var(--brand-200)] px-6">
        <Image
          src="/moda-interact-logo.jpg"
          alt="Moda Interact"
          width={32}
          height={32}
          className="h-8 w-8 rounded-md object-cover shadow-sm"
          priority
        />
        <span className="ml-3 text-lg font-bold tracking-tight text-[var(--brand-900)]">
          Moda Interact
        </span>
      </div>
      <nav
        className="flex-1 space-y-2 px-3 py-6"
        aria-label="Administration navigation"
      >
        <Link
          href="/"
          className={`${base} ${active === "tenants" ? selected : idle}`}
        >
          <Icon name="users" className="h-5 w-5 text-[var(--brand-700)]" />
          Tenant Directory
        </Link>
        <div>
          <Link
            href="/observability"
            aria-current={observabilityActive ? "page" : undefined}
            className={`${base} ${observabilityActive ? selected : idle}`}
          >
            <Icon name="chart" className="h-5 w-5 text-[var(--brand-600)]" />
            <span className="flex-1">Observability</span>
            <Icon name="chevron-down" className="h-4 w-4" />
          </Link>
          {observabilityActive ? (
            <div className="ml-8 mt-1 space-y-1 border-l border-[var(--brand-300)] pl-3">
              <Link
                href="/observability"
                className={`${base} !rounded-md px-3 py-2 text-sm ${active === "observability" ? selected : idle}`}
              >
                Overview
              </Link>
              <Link
                href="/observability/queues"
                aria-current={active === "queues" ? "page" : undefined}
                className={`${base} !rounded-md px-3 py-2 text-sm ${active === "queues" ? selected : idle}`}
              >
                Shopify Queues
              </Link>
              <a
                href={grafanaHref}
                target={grafanaHref.startsWith("http") ? "_blank" : undefined}
                rel={
                  grafanaHref.startsWith("http")
                    ? "noopener noreferrer"
                    : undefined
                }
                className={`${base} !rounded-md px-3 py-2 text-sm ${idle}`}
              >
                Grafana
              </a>
            </div>
          ) : null}
        </div>
      </nav>
      <div className="border-t border-[var(--brand-200)] p-4">
        <div className="flex items-center gap-3 rounded-lg bg-white/60 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-300)] text-sm font-bold text-[var(--brand-900)]">
            AD
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[var(--brand-900)]">
              Administrator
            </p>
            <p className="truncate text-xs text-[var(--brand-700)]">
              {roleLabel(administratorRole)}
            </p>
          </div>
          <Icon
            name="shield"
            className="h-4 w-4 shrink-0 text-[var(--brand-700)]"
          />
        </div>
        <div className="mt-3">
          <LogoutForm />
        </div>
      </div>
    </aside>
  );
}
