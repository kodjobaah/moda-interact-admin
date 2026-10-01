import { AdminShell } from "@/components/admin/admin-shell";
import { ModelCatalogueTable } from "@/components/admin/model-catalogue/model-catalogue-table";
import { getModelCatalogueAdminPage } from "@/lib/admin/model-catalogue";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";

export const dynamic = "force-dynamic";

type ModelCataloguePageProps = {
  searchParams: Promise<{
    availabilityId?: string | string[];
    drawer?: string | string[];
    id?: string | string[];
    page?: string | string[];
    query?: string | string[];
    status?: string | string[];
  }>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function statusFilter(
  value: string | undefined,
): "all" | "enabled" | "disabled" {
  if (value === undefined || value === "" || value === "all") return "all";
  if (value === "enabled" || value === "disabled") return value;
  throw new Error("Model catalogue status filter is invalid.");
}

export default async function ModelCataloguePage({
  searchParams,
}: ModelCataloguePageProps) {
  const principal = await requirePlatformAdminPage();
  const params = await searchParams;
  const availabilityId = first(params.availabilityId)?.trim() || undefined;
  const query = first(params.query);
  const status = first(params.status);
  const pageValue = Number(first(params.page) ?? 1);
  const catalogue = await getModelCatalogueAdminPage({
    availabilityId,
    query,
    status: statusFilter(status),
    page: Number.isFinite(pageValue) ? pageValue : 1,
  });

  return (
    <AdminShell active="model-catalogue">
      <div className="flex-1 overflow-auto p-4 sm:p-8">
        <ModelCatalogueTable
          catalogue={catalogue}
          canMutate={principal.role === "SUPER_ADMIN"}
          drawer={first(params.drawer)}
          selectedId={first(params.id)}
          filters={{ availabilityId, query, status, page: catalogue.page }}
        />
      </div>
    </AdminShell>
  );
}
