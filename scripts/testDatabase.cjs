// Shared by server DB suites and browser smoke-test cleanup utilities.
function requireTestDatabaseUrl(env = process.env) {
  if (env.NODE_ENV === "production") {
    throw new Error("Refusing to run database integration tests in production.");
  }
  const value = env.TEST_DATABASE_URL?.trim();
  if (!value) throw new Error("TEST_DATABASE_URL is required for database integration tests.");
  let url;
  let database;
  let schema;
  try {
    url = new URL(value);
    database = decodeURIComponent(url.pathname.replace(/^\//, ""));
    schema = url.searchParams.get("schema") ?? "public";
  } catch {
    throw new Error("Invalid TEST_DATABASE_URL configuration.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("TEST_DATABASE_URL must use the postgresql protocol.");
  }
  // Never accept hosted databases (including Neon), even with a test-named schema.
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error(
      "Refusing to run: TEST_DATABASE_URL must use a local loopback PostgreSQL host.",
    );
  }
  if (!/(^|[_-])test([_-]|$)/i.test(database) && !/(^|[_-])test([_-]|$)/i.test(schema)) {
    throw new Error(
      "Refusing to run: use an explicitly isolated test database or schema with a 'test' name segment.",
    );
  }
  return value;
}

function configureTestDatabase() {
  const value = requireTestDatabaseUrl();
  process.env.DATABASE_URL = value;
  process.env.DIRECT_URL = value;
  return value;
}

module.exports = { requireTestDatabaseUrl, configureTestDatabase };
