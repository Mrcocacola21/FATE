import { z } from "zod";

const positive = z.number().int().positive().max(2147483647);
const unique = (values: number[]) => [...new Set(values)].sort((a, b) => a - b);
export const configSchema = z
  .object({
    preset: z.enum(["quick", "research"]),
    modes: z
      .array(z.enum(["standard", "classic", "draft"]))
      .nonempty()
      .transform((values) => [...new Set(values)]),
    scenarios: z
      .array(z.enum(["controlled", "natural"]))
      .nonempty()
      .transform((values) => [...new Set(values)]),
    actions: z.array(positive).nonempty().transform(unique),
    seeds: z.array(z.number().int().min(1).max(0xffffffff)).nonempty().transform(unique),
    snapshotIntervals: z.array(positive).nonempty().transform(unique),
    warmup: z.number().int().min(0).max(10000),
    iterations: positive.max(10000),
    randomTargets: z.number().int().min(0).max(1000),
    targets: z
      .array(z.number().int().min(0).max(2147483647))
      .nonempty()
      .transform(unique)
      .optional(),
    storageBackend: z.enum(["memory", "postgres"]),
    snapshotPolicy: z.enum(["periodic_only", "production_policy"]),
    output: z.string().min(1),
    strict: z.boolean(),
  })
  .strict();
export type Config = z.infer<typeof configSchema>;

export function parseConfig(args: string[]): Config {
  const raw: Record<string, string> = {};
  const allowed = new Set([
    "preset",
    "modes",
    "scenarios",
    "actions",
    "seeds",
    "snapshot-intervals",
    "warmup",
    "iterations",
    "random-targets",
    "targets",
    "storage-backend",
    "snapshot-policy",
    "output",
    "strict",
  ]);
  for (const arg of args) {
    const match = /^--([a-z-]+)=(.+)$/.exec(arg);
    if (!match || !allowed.has(match[1]) || raw[match[1]] !== undefined)
      throw new Error(`Invalid or duplicate option: ${arg.split("=")[0]}. Use --name=value.`);
    raw[match[1]] = match[2];
  }
  const preset = z.enum(["quick", "research"]).parse(raw.preset ?? "quick");
  const numbers = (name: string, defaults: number[]) =>
    raw[name] === undefined
      ? defaults
      : raw[name].split(",").map((value) => (/^\d+$/.test(value) ? Number(value) : NaN));
  const integer = (name: string, fallback: number) =>
    raw[name] === undefined ? fallback : /^\d+$/.test(raw[name]) ? Number(raw[name]) : NaN;
  const research = preset === "research";
  return configSchema.parse({
    preset,
    modes: (raw.modes ?? "STANDARD").split(",").map((mode) => mode.toLowerCase()),
    scenarios: (raw.scenarios ?? "controlled").split(","),
    actions: numbers("actions", research ? [100, 250, 500, 1000] : [50, 100]),
    seeds: numbers("seeds", research ? Array.from({ length: 10 }, (_, i) => i + 1) : [1, 2]),
    snapshotIntervals: numbers(
      "snapshot-intervals",
      research ? [5, 10, 20, 50, 100] : [10, 20, 50],
    ),
    warmup: integer("warmup", research ? 10 : 2),
    iterations: integer("iterations", research ? 30 : 3),
    randomTargets: integer("random-targets", 3),
    targets: raw.targets === undefined ? undefined : numbers("targets", []),
    storageBackend: raw["storage-backend"] ?? "memory",
    snapshotPolicy: raw["snapshot-policy"] ?? "periodic_only",
    output: raw.output ?? `bench-results/replay-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    strict: z.enum(["true", "false"]).parse(raw.strict ?? "false") === "true",
  });
}
