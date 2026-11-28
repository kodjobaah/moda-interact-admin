import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { requirePlatformAdminPage } from "@/lib/auth/platform-admin";
import { prisma } from "@/lib/prisma";
import { RECOVERY_SCENARIOS } from "@/lib/admin/whatsapp-templates/authoring/scenarios";
import { readShopAssignments } from "@/lib/admin/whatsapp-templates/workflow/shop-assignments";
import {
  WORKFLOW_ROOT,
  workflowHref,
} from "@/lib/admin/whatsapp-templates/workflow/contracts";
import { createLogger } from "@modainteract/moda-interact-shared/logging";
import { resolveDeploymentEnvironmentName } from "@/lib/auth/environment";

export const dynamic = "force-dynamic";
const logger = createLogger({
  serviceName: "moda-interact-admin",
  environment: resolveDeploymentEnvironmentName(),
});
const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;
export default async function ShopAssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requirePlatformAdminPage();
  if (principal.role !== "SUPER_ADMIN") notFound();
  const params = await searchParams;
  const scenario = RECOVERY_SCENARIOS.find(
    (row) => row.id === first(params.scenario),
  );
  if (!scenario) notFound();
  const search = (first(params.search) ?? "").slice(0, 90);
  let data;
  try {
    data = await readShopAssignments(
      prisma,
      principal,
      scenario.id,
      search,
      Number(first(params.page) ?? "1"),
    );
  } catch (error) {
    logger.error("admin.whatsapp_workflow.shop_assignments_failed", {
      purpose: scenario.id,
      error,
    });
  }
  const pageHref = (page: number) =>
    `${WORKFLOW_ROOT}/assignments?${new URLSearchParams({ scenario: scenario.id, search, page: String(page) })}`;
  return (
    <AdminShell active="whatsapp-templates">
      <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="mx-auto max-w-7xl space-y-5">
          <Link
            className="text-sm text-blue-800 underline"
            href={WORKFLOW_ROOT}
          >
            ← Recovery scenarios
          </Link>
          <h1 className="text-2xl font-bold">
            Shop assignments — {scenario.label}
          </h1>
          <p className="text-sm text-slate-600">
            Stored approved and enabled variants for the configured sender. A
            version different from today&apos;s default is not necessarily a
            manual override. Counts do not establish current Meta or send
            eligibility.
          </p>
          <Link
            className="inline-block rounded bg-blue-800 px-3 py-2 text-sm font-semibold text-white"
            href={`${WORKFLOW_ROOT}?history=1&scenario=${scenario.id}`}
          >
            Choose a template to assign to shops
          </Link>
          <form
            className="flex flex-wrap items-end gap-3"
            action={`${WORKFLOW_ROOT}/assignments`}
            method="GET"
          >
            <input type="hidden" name="scenario" value={scenario.id} />
            <label className="text-sm">
              Shop domain
              <input
                className="ml-2 rounded border p-2"
                maxLength={90}
                name="search"
                defaultValue={search}
              />
            </label>
            <button type="submit" className="rounded border px-3 py-2 text-sm">
              Search
            </button>
          </form>
          {!data ? (
            <p role="alert" className="rounded border p-3 text-sm">
              Assignment inventory unavailable. Verify the sender configuration
              and check Admin logs.
            </p>
          ) : (
            <>
              <p className="text-xs text-slate-600">
                WABA {data.wabaId} · Each row is one shop/version; other
                versions may coexist for different header or promotion variants.
              </p>
              <div className="overflow-x-auto rounded-lg border bg-white">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      {[
                        "Shop",
                        "Format",
                        "Assigned version",
                        "Languages",
                        "Default relationship",
                      ].map((label) => (
                        <th key={label} scope="col" className="p-3">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => (
                      <tr
                        className="border-t"
                        key={JSON.stringify([
                          row.shopId,
                          row.format,
                          row.definitionId,
                          row.templateName,
                        ])}
                      >
                        <td className="p-3">
                          {row.domain}
                          <p className="text-xs text-slate-500">
                            {row.platform} · {row.shopStatus}
                          </p>
                        </td>
                        <td className="p-3">{row.format}</td>
                        <td className="p-3 break-all">
                          {row.definitionId ? (
                            <Link
                              className="text-blue-800 underline"
                              href={workflowHref(
                                row.definitionId,
                                "publish",
                                false,
                                "one",
                              )}
                            >
                              {row.templateName}
                            </Link>
                          ) : (
                            row.templateName
                          )}
                        </td>
                        <td className="p-3">
                          {row.languages}/20 ({row.variants} variants)
                        </td>
                        <td className="p-3">
                          {!row.definitionId
                            ? "Unlinked / legacy"
                            : !row.defaultConfigured
                              ? "No default configured"
                              : row.isDefault
                                ? "Matches configured default"
                                : "Different assigned version"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.rows.length === 0 && (
                  <p className="p-4 text-sm">
                    No matching approved, enabled assignments.
                  </p>
                )}
              </div>
              <nav
                aria-label="Assignment pages"
                className="flex justify-between text-sm"
              >
                {data.page > 1 ? (
                  <Link href={pageHref(data.page - 1)}>Previous</Link>
                ) : (
                  <span />
                )}
                <span>Page {data.page}</span>
                {data.hasNext ? (
                  <Link href={pageHref(data.page + 1)}>Next</Link>
                ) : (
                  <span />
                )}
              </nav>
            </>
          )}
        </div>
      </main>
    </AdminShell>
  );
}
