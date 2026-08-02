const { loadEnvLocal, resolveKnowledgeDbConnectionString } = require("./knowledge-env.cjs");

loadEnvLocal();

const value = resolveKnowledgeDbConnectionString();
if (!value) {
  console.error("Missing THOR_KNOWLEDGE_DB_DSN/POSTGRES_URL/POSTGRES_PRISMA_URL/DATABASE_URL");
  process.exit(1);
}

console.log("Knowledge DB connection string detected.");
