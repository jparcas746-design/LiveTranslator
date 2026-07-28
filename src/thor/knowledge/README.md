# ThorAI Knowledge Engine

This module is organized for production-grade growth and strict separation of concerns.

## Submodules

- `ingest/`: document import and indexing pipeline
- `search/`: vector similarity search
- `embeddings/`: provider-agnostic embedding interfaces and implementations
- `database/`: persistence contracts and PostgreSQL + pgvector implementation
- `types.ts`: domain-level types

## Required Environment Variables

- `THOR_ADMIN_KEY`: admin-only access to knowledge management APIs
- `THOR_KNOWLEDGE_DB_DSN`: PostgreSQL connection string
- `THOR_EMBEDDINGS_PROVIDER`: `hash` (default) or `ollama`
- `THOR_EMBED_DIM`: embedding dimensions (default: 384, set to 768 if schema uses vector(768))
- `THOR_OLLAMA_URL`: Ollama base URL (if using ollama embeddings)
- `THOR_OLLAMA_EMBED_MODEL`: Ollama embedding model name

## Database Setup

Run `database/sql/schema.sql` on your PostgreSQL instance with `pgvector` extension enabled.
