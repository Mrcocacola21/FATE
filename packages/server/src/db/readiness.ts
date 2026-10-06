import { getDatabaseClient } from "./client";
import { applicationMetrics, elapsedSeconds, type ApplicationMetrics } from "../observability/metrics";
import { performance } from "node:perf_hooks";

export const READINESS_TIMEOUT_MS = 2000;

export function createDatabaseReadinessCheck(
  query: () => Promise<unknown> = async () => getDatabaseClient().$queryRaw`SELECT 1`,
  timeoutMs = READINESS_TIMEOUT_MS,
  metrics: ApplicationMetrics = applicationMetrics,
): () => Promise<boolean> {
  let pending: Promise<boolean> | undefined;
  return async () => {
    const started = performance.now();
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
      const ok = await Promise.race([
        pending,
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), timeoutMs);
        }),
      ]);
      metrics.observeDatabase("readiness_probe", ok ? "success" : "error", elapsedSeconds(started),
        { code: performance.now() - started >= timeoutMs ? "READINESS_TIMEOUT" : "P1001" });
      return ok;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}

export const checkDatabaseReadiness = createDatabaseReadinessCheck();
