import { AdminShell } from '@/components/admin/admin-shell';
import { ObservabilityPanel } from '@/components/admin/observability-panel';
import { requirePlatformAdminPage } from '@/lib/auth/platform-admin';
import { getGrafanaNavigation } from '@/lib/observability/grafana';

export default async function ObservabilityPage() {
  await requirePlatformAdminPage();
  const navigation = getGrafanaNavigation();

  return (
    <AdminShell active="observability">
      <ObservabilityPanel navigation={navigation} />
    </AdminShell>
  );
}
