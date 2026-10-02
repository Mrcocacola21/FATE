import { PrismaClient } from "@prisma/client";

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

  localClient = globalDatabase.fatePrismaClient ?? new PrismaClient();
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
  await localClient.$disconnect();
}
