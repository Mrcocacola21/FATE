import { PrismaClient } from "@prisma/client";
import { applicationMetrics, measureDatabase, type ApplicationMetrics } from "../observability/metrics";

export function instrumentDatabase(client: PrismaClient, metrics: ApplicationMetrics = applicationMetrics): PrismaClient {
  // Public query extension; forwards the original query in its original transaction.
  // Repository API remains PrismaClient; production never uses $on on this extended client.
  return client.$extends({ name: "fate-observability", query: {
    $allOperations({ args, query }) { return measureDatabase(() => query(args), metrics); },
  } }) as unknown as PrismaClient;
}

const globalDatabase = globalThis as typeof globalThis & {
  fatePrismaClient?: PrismaClient;
};

let localClient: PrismaClient | undefined;

export class DatabaseConfigurationError extends Error {}

function requireDatabaseUrl(): void {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new DatabaseConfigurationError(
      "DATABASE_URL is required when database access is requested. Server health and Test/Sandbox rooms can run without it.",
    );
  }
}

export function getDatabaseClient(): PrismaClient {
  requireDatabaseUrl();

  if (localClient) return localClient;

  localClient = globalDatabase.fatePrismaClient ?? instrumentDatabase(new PrismaClient({ log: [] }));
  if (process.env.NODE_ENV !== "production") {
    globalDatabase.fatePrismaClient = localClient;
  }

  return localClient;
}

export async function connectDatabase(): Promise<PrismaClient> {
  const client = getDatabaseClient();
  await client.$connect();
  return client;
}

export async function disconnectDatabase(): Promise<void> {
  if (!localClient) return;
  const client = localClient;
  localClient = undefined;
  if (globalDatabase.fatePrismaClient === client) delete globalDatabase.fatePrismaClient;
  await client.$disconnect();
}
