import Link from "next/link";
import { adminI18n } from "@/i18n";
import { buildUrl } from "@/lib/admin/query";

type BillingView = "overview" | "plans" | "packs" | "events" | "controls";

const tabs: Array<{ value: BillingView; label: string }> = [
  { value: "overview", label: "billing.tab.overview" },
  { value: "plans", label: "billing.tab.plans" },
  { value: "packs", label: "billing.tab.recoveryPacks" },
  { value: "events", label: "billing.tab.appEvents" },
  { value: "controls", label: "billing.tab.controls" },
];

const relevantParams: Record<BillingView, string[]> = {
  overview: [],
  plans: ["planId", "drawer"],
  packs: ["packPage", "packStatus", "purchaseId"],
  events: ["eventPage", "state", "shopId", "from", "to", "eventId"],
  controls: [],
};

export function BillingTabs({
  current,
  params,
}: {
  current: BillingView;
  params: Record<string, string>;
}) {
  return (
    <nav
      className="mb-6 flex flex-wrap gap-2 border-b border-gray-200"
      aria-label={adminI18n.t("billing.tabs")}
    >
      {tabs.map((tab) => {
        const nextParams = Object.fromEntries(
          relevantParams[tab.value]
            .filter((key) => params[key])
            .map((key) => [key, params[key]]),
        );
        const href = buildUrl("/billing", { view: tab.value, ...nextParams });
        return (
          <Link
            key={tab.value}
            href={href}
            aria-current={current === tab.value ? "page" : undefined}
            className={`border-b-2 px-3 py-3 text-sm font-semibold ${
              current === tab.value
                ? "border-[var(--brand-700)] text-[var(--brand-800)]"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800"
            }`}
          >
            {adminI18n.t(tab.label)}
          </Link>
        );
      })}
    </nav>
  );
}

export type { BillingView };
