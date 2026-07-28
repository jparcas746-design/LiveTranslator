CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS thor_knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  source_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  chunk_count INTEGER NOT NULL DEFAULT 0,
  indexed_at TIMESTAMPTZ,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE INDEX IF NOT EXISTS idx_thor_knowledge_documents_category
  ON thor_knowledge_documents(category);

CREATE INDEX IF NOT EXISTS idx_thor_knowledge_documents_status
  ON thor_knowledge_documents(status);

CREATE INDEX IF NOT EXISTS idx_thor_knowledge_chunks_document
  ON thor_knowledge_chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_thor_knowledge_chunks_embedding_ivfflat
  ON thor_knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
