import { AdminShell } from "@/components/admin/admin-shell";
import { ModelAvailabilityCatalog } from "@/components/admin/model-availability/model-availability-catalog";
import {
  getModelAvailabilityCatalogue,
  searchModelAvailabilityShopCandidates,
} from "@/lib/admin/model-availability";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";

export const dynamic = "force-dynamic";

type ModelAvailabilityPageProps = {
  searchParams: Promise<{
    drawer?: string | string[];
    availabilityId?: string | string[];
    shopSearch?: string | string[];
  }>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ModelAvailabilityPage({
  searchParams,
}: ModelAvailabilityPageProps) {
  const principal = await requirePlatformAdminPage();
  const catalogue = await getModelAvailabilityCatalogue();
  const params = await searchParams;
  const drawer = first(params.drawer);
  const availabilityId = first(params.availabilityId);
  const shopSearch = first(params.shopSearch) ?? "";
  const shopCandidates =
    drawer === "create-shop"
      ? await searchModelAvailabilityShopCandidates(shopSearch)
      : [];

  return (
    <AdminShell active="model-availability">
      <div className="flex-1 overflow-auto p-4 sm:p-8">
        <ModelAvailabilityCatalog
          catalogue={catalogue}
          canMutate={principal.role === "SUPER_ADMIN"}
          drawer={drawer}
          availabilityId={availabilityId}
          shopSearch={shopSearch}
          shopCandidates={shopCandidates}
        />
      </div>
    </AdminShell>
  );
}
