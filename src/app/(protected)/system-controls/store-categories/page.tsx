import { AdminShell } from "@/components/admin/admin-shell";
import { StoreCategoryCatalog } from "@/components/admin/store-categories/store-category-catalog";
import { getStoreCategoryCatalogue } from "@/lib/admin/store-categories";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";

export const dynamic = "force-dynamic";

type StoreCategoriesPageProps = {
  searchParams: Promise<{ category?: string | string[] }>;
};

export default async function StoreCategoriesPage({
  searchParams,
}: StoreCategoriesPageProps) {
  await requirePlatformAdminPage();
  const catalogue = await getStoreCategoryCatalogue();
  const rawCategory = (await searchParams).category;
  const selectedCategoryId = Array.isArray(rawCategory)
    ? rawCategory[0]
    : rawCategory;

  return (
    <AdminShell active="store-categories">
      <div className="flex-1 overflow-auto p-4 sm:p-8">
        <StoreCategoryCatalog
          catalogue={catalogue}
          selectedCategoryId={selectedCategoryId}
        />
      </div>
    </AdminShell>
  );
}