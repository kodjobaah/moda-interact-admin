'use client';
import { useState } from 'react';
import { previewStorageAction } from '@/app/actions/preview-storage';
import type { PreviewStorageUsage } from '@/lib/admin/platform-configuration/preview-storage-core';

export function PreviewStorageControls({ environment }: { environment: string }) {
  const [usage, setUsage] = useState<PreviewStorageUsage | null>(null);
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  async function execute(operation: 'read' | 'purge') {
    if (pending) return;
    if (operation === 'purge' && !window.confirm(`Delete all retained Studio preview conversations, results and tool tests in ${environment}? Existing preview IDs will no longer work. Live customer conversations and policies are unaffected.`)) return;
    setPending(true); setMessage('');
    try {
      const result = await previewStorageAction(operation, operation === 'purge' ? { reason, confirmation } : undefined);
      if (!result.ok) { setMessage(result.message); return; }
      setUsage(result.usage.purged ? { conversations: 0, runs: 0, bytes: 0, active: 0, purged: true } : result.usage);
      if (operation === 'purge') { setMessage('Preview data purged. Start a new conversation in Studio.'); setConfirmation(''); setReason(''); }
    } catch { setMessage('Unable to manage preview storage.'); }
    finally { setPending(false); }
  }
  return <section aria-label="Preview storage management" className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
    <h2 className="text-xl font-semibold">Preview storage management — {environment}</h2>
    <p>Inspect retained previews or delete them from this deployment. Purge is refused while a preview is running. Live customer conversations and saved policies are unaffected.</p>
    {usage && <p role="status">{usage.conversations} conversations · {usage.runs} runs/tool tests · {usage.bytes.toLocaleString()} bytes · {usage.active} active</p>}
    <button type="button" disabled={pending} onClick={() => void execute('read')} className="rounded border p-2">Refresh storage usage</button>
    <label className="block">Audit reason (required)<textarea value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} className="block w-full border p-2" /></label>
    <label className="block">Type PURGE {environment}<input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className="block w-full border p-2" /></label>
    <button type="button" disabled={pending || confirmation !== `PURGE ${environment}` || !reason.trim()} onClick={() => void execute('purge')} className="rounded bg-red-700 text-white p-2 disabled:opacity-50">Purge preview data</button>
    {message && <p role="status">{message}</p>}
  </section>;
}
