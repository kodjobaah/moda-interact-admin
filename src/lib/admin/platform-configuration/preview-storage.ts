import 'server-only';
import Redis from 'ioredis';
import { createLogger } from '@modainteract/moda-interact-shared/logging';
import { requirePlatformAdminMutation, requirePlatformAdminRead } from '@/lib/auth/platform-admin';
import { getConfigurationEnvironment } from './environment';
import { requireConfigurationSuperAdmin } from './service';

import { managePreviewStorageWithDependencies } from './preview-storage-core';

export async function managePreviewStorage(operation: 'read' | 'purge', input?: unknown) {
  const principal = await (operation === 'purge' ? requirePlatformAdminMutation() : requirePlatformAdminRead());
  requireConfigurationSuperAdmin(principal);
  const environment = getConfigurationEnvironment();
  const url = process.env.REDIS_URL?.trim();
  if (!url) throw new Error('Preview storage is unavailable.');
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 0, connectTimeout: 3000, commandTimeout: 5000, retryStrategy: () => null });
  redis.on('error', () => { /* Never log credential-bearing transport errors. */ });
  const logger = createLogger({ serviceName: 'moda-interact-admin', environment });
  try {
    return await managePreviewStorageWithDependencies(operation, input, { principal, environment,
      eval: (script, key, op, now) => redis.eval(script, 1, key, op, now),
      audit: (data) => logger.info('admin.preview.storage.management', data),
    });
  } finally { redis.disconnect(); }
}
