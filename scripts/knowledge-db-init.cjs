const fs = require("node:fs/promises");
const path = require("node:path");
const { Client } = require("pg");
const { loadEnvLocal, resolveKnowledgeDbConnectionString } = require("./knowledge-env.cjs");

async function main() {
  loadEnvLocal();

  const connectionString = resolveKnowledgeDbConnectionString();
  if (!connectionString) {
    console.error("[knowledge-db-init] Missing database connection string.");
    console.error("Set one of: THOR_KNOWLEDGE_DB_DSN, POSTGRES_URL, POSTGRES_PRISMA_URL, DATABASE_URL.");
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, "..", "src", "thor", "knowledge", "database", "sql", "schema.sql");
  const schemaSql = await fs.readFile(schemaPath, "utf8");

  const client = new Client({ connectionString });

  try {
    await client.connect();
    await client.query(schemaSql);
    console.log("[knowledge-db-init] Knowledge schema applied successfully.");
  } catch (error) {
    console.error("[knowledge-db-init] Failed to apply knowledge schema.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error("[knowledge-db-init] Unexpected failure.");
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
