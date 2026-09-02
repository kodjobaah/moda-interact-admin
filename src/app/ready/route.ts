import { prisma } from '@/lib/prisma';
import { createReadinessResponse } from '@/lib/health/readiness';

export async function GET() {
  return createReadinessResponse(() => prisma.$queryRaw`SELECT 1`);
}