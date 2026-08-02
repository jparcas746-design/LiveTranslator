const { Client } = require("pg");
const { loadEnvLocal } = require("./knowledge-env.cjs");

const REQUIRED_EXTENSIONS = ["pgcrypto", "pg_trgm", "unaccent", "vector"];
const REQUIRED_TABLES = [
  "signipedia_categories",
  "signipedia_symbols",
  "signipedia_symbol_aliases",
  "signipedia_symbol_tags",
  "signipedia_symbol_synonyms",
  "signipedia_related_symbols",
  "signipedia_historical_periods",
  "signipedia_sources",
  "signipedia_media",
  "signipedia_translations",
  "signipedia_favorites",
];

async function main() {
  loadEnvLocal();

  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    console.error("[signipedia-db-check] DATABASE_URL is missing.");
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 10000,
    keepAlive: true,
  });

  try {
    await client.connect();

    const ext = await client.query(
      "SELECT extname FROM pg_extension WHERE extname = ANY($1::text[]) ORDER BY extname",
      [REQUIRED_EXTENSIONS]
    );
    const extSet = new Set(ext.rows.map((row) => row.extname));
    const missingExt = REQUIRED_EXTENSIONS.filter((name) => !extSet.has(name));

    const tables = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])",
      [REQUIRED_TABLES]
    );
    const tableSet = new Set(tables.rows.map((row) => row.table_name));
    const missingTables = REQUIRED_TABLES.filter((name) => !tableSet.has(name));

    const symbolColumns = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='signipedia_symbols'"
    );
    const columnSet = new Set(symbolColumns.rows.map((row) => row.column_name));
    const requiredSymbolColumns = ["vision_embedding", "vision_embedding_source", "search_document"];
    const missingColumns = requiredSymbolColumns.filter((name) => !columnSet.has(name));

    if (missingExt.length || missingTables.length || missingColumns.length) {
      console.error("[signipedia-db-check] Schema check failed.");
      if (missingExt.length) console.error("Missing extensions:", missingExt.join(", "));
      if (missingTables.length) console.error("Missing tables:", missingTables.join(", "));
      if (missingColumns.length) console.error("Missing signipedia_symbols columns:", missingColumns.join(", "));
      process.exitCode = 1;
      return;
    }

    console.log("[signipedia-db-check] Schema looks healthy.");
  } catch (error) {
    console.error("[signipedia-db-check] Failed.");
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error("[signipedia-db-check] Unexpected failure.");
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
