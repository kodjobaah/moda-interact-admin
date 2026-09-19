import Link from "next/link";
import { withParamUpdates } from "@/lib/admin/query";

export type BillingPlansSection = "pricing" | "features";

const sections: Array<{ value: BillingPlansSection; label: string }> = [
  { value: "pricing", label: "Pricing plans" },
  { value: "features", label: "Features" },
];

export function BillingPlansNavigation({
  current,
  params,
}: {
  current: BillingPlansSection;
  params: Record<string, string>;
}) {
  return (
    <nav
      className="mb-6 inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm"
      aria-label="Billing plan administration"
    >
      {sections.map((section) => {
        const href = withParamUpdates("/billing", params, {
          view: "plans",
          section: section.value,
          planId: null,
          featureId: null,
          drawer: null,
          pricingError: null,
        });

        return (
          <Link
            key={section.value}
            href={href}
            aria-current={current === section.value ? "page" : undefined}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
              current === section.value
                ? "bg-[var(--brand-700)] text-white"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
