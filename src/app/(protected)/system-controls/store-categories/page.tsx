import { AdminShell } from "@/components/admin/admin-shell";
import { StoreCategoryCatalog } from "@/components/admin/store-categories/store-category-catalog";
import { getStoreCategoryCatalogue } from "@/lib/admin/store-categories";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";

export const dynamic = "force-dynamic";

type StoreCategoryTab = "details" | "templates" | "taxonomy";

type StoreCategoriesPageProps = {
  searchParams: Promise<{
    category?: string | string[];
    tab?: string | string[];
    template?: string | string[];
  }>;
};

export default async function StoreCategoriesPage({
  searchParams,
}: StoreCategoriesPageProps) {
  await requirePlatformAdminPage();
  const catalogue = await getStoreCategoryCatalogue();
  const params = await searchParams;
  const rawCategory = params.category;
  const selectedCategoryId = Array.isArray(rawCategory)
    ? rawCategory[0]
    : rawCategory;
  const rawTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const selectedTab: StoreCategoryTab =
    rawTab === "templates" || rawTab === "taxonomy" ? rawTab : "details";
  const rawTemplate = params.template;
  const selectedTemplateId = Array.isArray(rawTemplate)
    ? rawTemplate[0]
    : rawTemplate;

  return (
    <AdminShell active="store-categories">
      <div className="flex-1 overflow-auto p-4 sm:p-8">
        <StoreCategoryCatalog
          catalogue={catalogue}
          selectedCategoryId={selectedCategoryId}
          selectedTab={selectedTab}
          selectedTemplateId={selectedTemplateId}
        />
      </div>
    </AdminShell>
  );
}