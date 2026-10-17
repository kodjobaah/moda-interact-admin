import Link from "next/link";
import type { PublicContract } from "@/lib/admin/platform-configuration/contracts";

export function ConfigurationNavigation({ contracts, selectedKey }: { contracts: readonly PublicContract[]; selectedKey: string }) {
  return <nav aria-label="Configuration groups" className="flex flex-wrap gap-2">
    {contracts.map((contract) => <Link key={contract.key} href={`/system-controls/platform-configuration?key=${encodeURIComponent(contract.key)}`}
      aria-current={selectedKey === contract.key ? "page" : undefined}
      className={`rounded-md border px-3 py-2 text-sm font-semibold ${selectedKey === contract.key ? "border-[var(--brand-700)] bg-[var(--brand-100)] text-[var(--brand-900)]" : "border-gray-300 bg-white"}`}>
      {contract.title}
    </Link>)}
  </nav>;
}
