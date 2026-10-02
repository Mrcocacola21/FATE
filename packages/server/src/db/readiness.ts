import { getDatabaseClient } from "./client";

export const READINESS_TIMEOUT_MS = 5000;

export function createDatabaseReadinessCheck(
  query: () => Promise<unknown> = async () => getDatabaseClient().$queryRaw`SELECT 1`,
  timeoutMs = READINESS_TIMEOUT_MS,
): () => Promise<boolean> {
  let pending: Promise<boolean> | undefined;
  return async () => {
    // The HTTP deadline cannot cancel a native Prisma query. Share it until it
    // settles so an outage cannot accumulate a new query on every probe.
    pending ??= Promise.resolve()
      .then(query)
      .then(
        () => true,
        () => false,
      )
      .finally(() => {
        pending = undefined;
      });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        pending,
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}

export const checkDatabaseReadiness = createDatabaseReadinessCheck();
