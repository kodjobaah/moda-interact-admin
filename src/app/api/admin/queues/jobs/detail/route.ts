import { NextResponse } from 'next/server';

import {
  InvalidQueueJobQueryError,
  QueueJobNotFoundError,
  QueueMonitorUnavailableError,
  readQueueJobDetail,
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
    return NextResponse.json(await readQueueJobDetail({
      queueName: params.get('queue') ?? undefined,
      status: params.get('status') ?? undefined,
      jobId: params.get('jobId') ?? undefined,
    }), { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof InvalidQueueJobQueryError) {
      return NextResponse.json({ error: 'invalid_query' }, { status: 400, headers: NO_STORE_HEADERS });
    }
    if (error instanceof QueueJobNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE_HEADERS });
    }
    if (error instanceof QueueMonitorUnavailableError) {
      return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE_HEADERS });
    }
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE_HEADERS });
  }
}