import Link from "next/link";
import type { StoreCategoryTab } from "./store-category-catalog";

export function StoreCategoryMaintenanceTabs({
  categoryId,
  activeTab,
  templateCount,
  mappingCount,
}: {
  categoryId: string;
  activeTab: StoreCategoryTab;
  templateCount: number;
  mappingCount: number;
}) {
  const tabs: Array<[StoreCategoryTab, string]> = [
    ["details", "Category details"],
    ["templates", `Prompt templates (${templateCount})`],
    ["taxonomy", `Category mappings (${mappingCount})`],
  ];

  return (
    <nav
      aria-label="Store category sections"
      className="border-b border-gray-200 px-5"
    >
      <div className="flex flex-wrap gap-1">
        {tabs.map(([tab, label]) => {
          const selected = activeTab === tab;
          return (
            <Link
              key={tab}
              href={`/system-controls/store-categories?category=${encodeURIComponent(categoryId)}&tab=${tab}`}
              aria-current={selected ? "page" : undefined}
              className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                selected
                  ? "border-[var(--brand-700)] text-[var(--brand-900)]"
                  : "border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
