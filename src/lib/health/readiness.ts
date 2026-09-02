const POSTGRES_READINESS_TIMEOUT_MS = 1_000;

export type DatabasePing = () => Promise<unknown>;

export async function createReadinessResponse(
  databasePing: DatabasePing,
  timeoutMs = POSTGRES_READINESS_TIMEOUT_MS,
) {
  try {
    await withTimeout(databasePing(), timeoutMs);
    return Response.json({ status: 'ready' });
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503 });
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('PostgreSQL readiness check timed out')),
      timeoutMs,
    );

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}