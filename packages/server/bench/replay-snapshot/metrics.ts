import { z } from "zod";

export const statsSchema = z
  .object({
    count: z.number().int().nonnegative(),
    min: z.number().finite().nonnegative(),
    max: z.number().finite().nonnegative(),
    mean: z.number().finite().nonnegative(),
    p50: z.number().finite().nonnegative(),
    p95: z.number().finite().nonnegative(),
    p99: z.number().finite().nonnegative(),
    stddev: z.number().finite().nonnegative(),
  })
  .strict();

/** Linear interpolation at (n - 1) * p (R type 7); population standard deviation. */
export function statistics(values: number[]): z.infer<typeof statsSchema> {
  if (values.some((value) => !Number.isFinite(value) || value < 0))
    throw new Error("INVALID_METRIC_SAMPLE");
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length)
    return { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0, stddev: 0 };
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const percentile = (p: number) => {
    const position = (sorted.length - 1) * p;
    const lower = Math.floor(position);
    return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower);
  };
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted.at(-1)!,
    mean,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    stddev: Math.sqrt(sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sorted.length),
  };
}
export const utf8Bytes = (serialized: string) => Buffer.byteLength(serialized, "utf8");
export const sumBytes = (records: string[]) =>
  records.reduce((sum, record) => sum + utf8Bytes(record), 0);

export function snapshotRevisions(length: number, interval: number, final: boolean): number[] {
  if (
    !Number.isSafeInteger(length) ||
    length < 0 ||
    !Number.isSafeInteger(interval) ||
    interval < 1
  )
    throw new Error("INVALID_SNAPSHOT_PLACEMENT");
  const revisions = Array.from(
    { length: Math.floor(length / interval) },
    (_, i) => (i + 1) * interval,
  );
  if (final && length > 0 && revisions.at(-1) !== length) revisions.push(length);
  return revisions;
}
