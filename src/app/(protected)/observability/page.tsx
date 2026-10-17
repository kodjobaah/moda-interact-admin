import { AdminShell } from '@/components/admin/admin-shell';
import { ObservabilityPanel } from '@/components/admin/observability-panel';
import { requirePlatformAdminPage } from '@/lib/auth/platform-admin';
import { getGrafanaNavigation } from '@/lib/observability/grafana';
import { getPlatformGrafanaNavigation } from '@/lib/observability/platform-grafana-navigation';

export default async function ObservabilityPage() {
  const principal = await requirePlatformAdminPage();
  const navigation = principal.role === "SUPER_ADMIN" ? await getPlatformGrafanaNavigation() : getGrafanaNavigation();

  return (
    <AdminShell active="observability">
      <ObservabilityPanel navigation={navigation} />
    </AdminShell>
  );
}
