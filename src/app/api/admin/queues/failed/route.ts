import { NextResponse } from 'next/server';

import {
  InvalidFailedJobQueryError,
  QueueMonitorUnavailableError,
  readFailedJobSnapshot,
} from '@/lib/admin/queue-monitor';
import {
  PlatformAdminUnauthorizedError,
  requirePlatformAdminRead,
} from '@/lib/auth/platform-admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  try {
    await requirePlatformAdminRead();
  } catch (error) {
    if (error instanceof PlatformAdminUnauthorizedError) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE_HEADERS });
    }
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE_HEADERS });
  }

  const params = new URL(request.url).searchParams;
  try {
    return NextResponse.json(await readFailedJobSnapshot({
      queueName: params.get('queue') ?? undefined,
      page: params.get('page') ?? undefined,
      limit: params.get('limit') ?? undefined,
      sort: params.get('sort') ?? undefined,
      direction: params.get('direction') ?? undefined,
    }), { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof InvalidFailedJobQueryError) {
      return NextResponse.json({ error: 'invalid_query' }, { status: 400, headers: NO_STORE_HEADERS });
    }
    if (error instanceof QueueMonitorUnavailableError) {
      return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE_HEADERS });
    }
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE_HEADERS });
  }
}