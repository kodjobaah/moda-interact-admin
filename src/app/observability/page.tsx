import { AdminShell } from '@/components/admin/admin-shell';
import { ObservabilityPanel } from '@/components/admin/observability-panel';

export default function ObservabilityPage() {
  return (
    <AdminShell active="observability">
      <ObservabilityPanel />
    </AdminShell>
  );
}
