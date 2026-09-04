import { NextResponse } from 'next/server';

import {
  QueueMonitorUnavailableError,
  readQueueMonitorSnapshot,
} from '@/lib/admin/queue-monitor';
import {
  PlatformAdminUnauthorizedError,
  requirePlatformAdminRead,
} from '@/lib/auth/platform-admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

export async function GET() {
  try {
    await requirePlatformAdminRead();
  } catch (error) {
    if (error instanceof PlatformAdminUnauthorizedError) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE_HEADERS });
    }
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE_HEADERS });
  }

  try {
    return NextResponse.json(await readQueueMonitorSnapshot(), { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (!(error instanceof QueueMonitorUnavailableError)) {
      return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE_HEADERS });
    }
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE_HEADERS });
  }
}