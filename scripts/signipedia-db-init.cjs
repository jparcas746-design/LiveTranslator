const fs = require("node:fs/promises");
const path = require("node:path");
const { Client } = require("pg");
const { loadEnvLocal } = require("./knowledge-env.cjs");

const REQUIRED_EXTENSIONS = ["pgcrypto", "pg_trgm", "unaccent", "vector"];

async function verifySchema(client) {
  const ext = await client.query(
    "SELECT extname FROM pg_extension WHERE extname = ANY($1::text[]) ORDER BY extname",
    [REQUIRED_EXTENSIONS]
  );

  const existing = new Set(ext.rows.map((row) => row.extname));
  const missingExt = REQUIRED_EXTENSIONS.filter((name) => !existing.has(name));

  const tableRows = await client.query(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name LIKE 'signipedia_%'
    ORDER BY table_name
    `
  );

  const tables = tableRows.rows.map((row) => row.table_name);

  return {
    missingExt,
    tables,
  };
}

async function main() {
  loadEnvLocal();

  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    console.error("[signipedia-db-init] DATABASE_URL is missing.");
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, "..", "src", "thor", "signipedia", "database", "sql", "schema.sql");
  const schemaSql = await fs.readFile(schemaPath, "utf8");

  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 10000,
    keepAlive: true,
  });

  try {
    await client.connect();
    await client.query(schemaSql);

    const report = await verifySchema(client);
    if (report.missingExt.length > 0) {
      console.error("[signipedia-db-init] Missing required extensions:", report.missingExt.join(", "));
      process.exitCode = 1;
      return;
    }

    console.log("[signipedia-db-init] Signipedia schema applied and verified.");
    console.log(`[signipedia-db-init] Tables detected: ${report.tables.length}`);
  } catch (error) {
    console.error("[signipedia-db-init] Failed to apply schema.");
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error("[signipedia-db-init] Unexpected failure.");
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
