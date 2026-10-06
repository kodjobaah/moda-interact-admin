import { AdminShell } from "@/components/admin/admin-shell";
import { StoreCategoryCatalog } from "@/components/admin/store-categories/store-category-catalog";
import { getStoreCategoryCatalogue } from "@/lib/admin/store-categories";
import { getReferenceTaxonomyIndexStatus } from "@/lib/admin/shopify-taxonomy-index-management";
import { getTranslationConfigurationAdminData } from "@/lib/admin/translation-configuration";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
  const principal = await requirePlatformAdminPage();
  const [catalogue, taxonomyIndexStatus, translationConfiguration] = await Promise.all([
    getStoreCategoryCatalogue(),
    getReferenceTaxonomyIndexStatus(),
    getTranslationConfigurationAdminData(),
  ]);
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
          taxonomyIndexStatus={taxonomyIndexStatus}
          translationConfiguration={translationConfiguration}
          canManageTaxonomy={principal.role === "SUPER_ADMIN"}
          canManageTranslations={principal.role === "SUPER_ADMIN"}
        />
      </div>
    </AdminShell>
  );
}