'use server';
import { managePreviewStorage } from '@/lib/admin/platform-configuration/preview-storage';

export async function previewStorageAction(operation: 'read' | 'purge', input?: unknown) {
  if (operation !== 'read' && operation !== 'purge') return { ok: false as const, message: 'Unsupported operation.' };
  try { return { ok: true as const, usage: await managePreviewStorage(operation, input) }; }
  catch { return { ok: false as const, message: 'Storage operation unavailable or refused. Check access, confirmation and audit reason; finish or cancel active previews before purging.' }; }
}
