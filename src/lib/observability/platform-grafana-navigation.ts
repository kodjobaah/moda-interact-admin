import { prisma } from "@/lib/prisma";
import { PLATFORM_POLICY_REGISTRY, validateConfiguration } from "@/lib/admin/platform-configuration/contracts";
import { getConfigurationEnvironment } from "@/lib/admin/platform-configuration/service";
import { getGrafanaNavigation, type GrafanaNavigation } from "./grafana";

/** Keep the existing safe navigation when database policy has not yet been configured. */
export async function getPlatformGrafanaNavigation(): Promise<GrafanaNavigation> {
  const fallback = getGrafanaNavigation();
  try {
    const environment = getConfigurationEnvironment();
    const row = await prisma.platformConfiguration.findUnique({
      where: { environment_key: { environment, key: "admin.grafana" } },
      select: { value: true },
    });
    if (!row) return fallback;
    const contract = PLATFORM_POLICY_REGISTRY.get("admin.grafana")!;
    const validated = validateConfiguration(contract, row.value);
    if (!validated.ok) return fallback;
    const urls = validated.values;
    const navigation = getGrafanaNavigation({
      baseUrl: urls.baseUrl as string | null,
      logsUrl: urls.logsUrl as string | null,
      metricsUrl: urls.metricsUrl as string | null,
      tracesUrl: urls.tracesUrl as string | null,
      platformDashboardUrl: urls.platformDashboardUrl as string | null,
    });
    return navigation;
  } catch {
    return fallback;
  }
}
