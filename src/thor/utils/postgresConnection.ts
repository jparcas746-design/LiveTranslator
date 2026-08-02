type PostgresConnectionOptions = {
  label: string;
};

function normalizeConnectionString(value: string) {
  return value.trim();
}

function validatePostgresConnectionString(connectionString: string, label: string) {
  let url: URL;

  if (connectionString === "postgres://" || connectionString === "postgresql://") {
    throw new Error(`${label} database is misconfigured: DATABASE_URL is truncated and only contains the PostgreSQL scheme prefix. Provide a full connection string with username, password, host, port, and database name.`);
  }

  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(`${label} database is misconfigured: DATABASE_URL must be a valid PostgreSQL connection string (postgres:// or postgresql://).`);
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`${label} database is misconfigured: DATABASE_URL must start with postgres:// or postgresql://.`);
  }

  if (!url.hostname || url.hostname === "base") {
    throw new Error(`${label} database is misconfigured: DATABASE_URL has an invalid hostname "${url.hostname || "<empty>"}". Check the value in .env.local or your deployment environment.`);
  }

  if (!url.username || !url.password || !url.pathname || url.pathname === "/") {
    throw new Error(`${label} database is misconfigured: DATABASE_URL must include username, password, host, and database name.`);
  }

  return normalizeConnectionString(connectionString);
}

export function resolveRequiredPostgresConnectionString({ label }: PostgresConnectionOptions) {
  const connectionString = process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error(`${label} database is not configured: DATABASE_URL is missing.`);
  }

  return validatePostgresConnectionString(connectionString, label);
}
