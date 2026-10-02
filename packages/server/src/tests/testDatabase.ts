export function requireTestDatabaseUrl(): string {
  const value = process.env.TEST_DATABASE_URL?.trim();
  if (!value) throw new Error("TEST_DATABASE_URL is required for database integration tests.");
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("TEST_DATABASE_URL must use the postgresql protocol.");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const schema = url.searchParams.get("schema") ?? "public";
  if (!/(^|[_-])test([_-]|$)/i.test(database) && !/(^|[_-])test([_-]|$)/i.test(schema)) {
    throw new Error(
      "Refusing to run: use an explicitly isolated test database or schema with a 'test' name segment.",
    );
  }
  if (process.env.DATABASE_URL) {
    const existing = new URL(process.env.DATABASE_URL);
    if (
      existing.host === url.host &&
      existing.pathname === url.pathname &&
      (existing.searchParams.get("schema") ?? "public") === schema &&
      process.env.NODE_ENV === "production"
    ) {
      throw new Error("Refusing to run against the configured production database.");
    }
  }
  return value;
}
