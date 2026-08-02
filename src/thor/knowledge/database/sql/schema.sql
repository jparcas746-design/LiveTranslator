CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS thor_knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  source_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  chunk_count INTEGER NOT NULL DEFAULT 0,
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  file_path TEXT NOT NULL DEFAULT '',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  indexed_at TIMESTAMPTZ,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE thor_knowledge_documents
  ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT NOT NULL DEFAULT 0;

ALTER TABLE thor_knowledge_documents
  ADD COLUMN IF NOT EXISTS file_path TEXT NOT NULL DEFAULT '';

ALTER TABLE thor_knowledge_documents
  ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS thor_knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES thor_knowledge_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  page_number INTEGER,
  embedding VECTOR(768) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(document_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS thor_knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  category TEXT NOT NULL,
  file_bytes BYTEA NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_thor_knowledge_documents_category
  ON thor_knowledge_documents(category);

CREATE INDEX IF NOT EXISTS idx_thor_knowledge_documents_status
  ON thor_knowledge_documents(status);

CREATE INDEX IF NOT EXISTS idx_thor_knowledge_documents_uploaded_at
  ON thor_knowledge_documents(uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_thor_knowledge_documents_name_trgm
  ON thor_knowledge_documents USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_thor_knowledge_documents_file_path
  ON thor_knowledge_documents(file_path);

CREATE INDEX IF NOT EXISTS idx_thor_knowledge_chunks_document
  ON thor_knowledge_chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_thor_knowledge_sources_storage_key
  ON thor_knowledge_sources(storage_key);

CREATE INDEX IF NOT EXISTS idx_thor_knowledge_chunks_embedding_ivfflat
  ON thor_knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
