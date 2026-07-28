// PostgreSQL + pgvector repository implementation for production knowledge storage.
import { Pool, type PoolClient } from "pg";
import type {
  IndexStatus,
  KnowledgeDocument,
  SearchQuery,
  SearchResultChunk,
} from "@/thor/knowledge/types";
import {
  createRepositoryNotConfiguredError,
  type CreateKnowledgeChunkInput,
  type CreateKnowledgeDocumentInput,
  type KnowledgeRepository,
} from "@/thor/knowledge/database/repository";
import { thorLogger } from "@/thor/utils/logger";

let pool: Pool | null = null;

function getPool() {
  if (pool) {
    return pool;
  }

  const connectionString = process.env.THOR_KNOWLEDGE_DB_DSN;
  if (!connectionString) {
    return null;
  }

  pool = new Pool({ connectionString });
  return pool;
}

function requirePool() {
  const resolvedPool = getPool();
  if (!resolvedPool) {
    throw createRepositoryNotConfiguredError();
  }
  return resolvedPool;
}

function vectorLiteral(values: number[]) {
  return `[${values.join(",")}]`;
}

function mapDocumentRow(row: any): KnowledgeDocument {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    sourceType: row.source_type,
    status: row.status,
    chunkCount: Number(row.chunk_count || 0),
    indexedAt: row.indexed_at ? new Date(row.indexed_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    metadata: row.metadata || {},
  };
}

async function withTransaction<T>(task: (client: PoolClient) => Promise<T>) {
  const connection = requirePool();
  const client = await connection.connect();

  try {
    await client.query("BEGIN");
    const result = await task(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export const postgresKnowledgeRepository: KnowledgeRepository = {
  isConfigured() {
    return Boolean(getPool());
  },

  async listDocuments() {
    const connection = requirePool();
    const result = await connection.query(
      `
      SELECT id, name, category, source_type, status, chunk_count, indexed_at, created_at, updated_at, metadata
      FROM thor_knowledge_documents
      ORDER BY created_at DESC
      `
    );

    return result.rows.map(mapDocumentRow);
  },

  async createDocument(input: CreateKnowledgeDocumentInput) {
    const connection = requirePool();
    const result = await connection.query(
      `
      INSERT INTO thor_knowledge_documents (name, category, source_type, status, metadata)
      VALUES ($1, $2, $3, 'queued', $4)
      RETURNING id, name, category, source_type, status, chunk_count, indexed_at, created_at, updated_at, metadata
      `,
      [input.name, input.category, input.sourceType, input.metadata]
    );

    return mapDocumentRow(result.rows[0]);
  },

  async updateDocumentCategory(documentId: string, category: string) {
    const connection = requirePool();
    const result = await connection.query(
      `
      UPDATE thor_knowledge_documents
      SET category = $2,
          updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, category, source_type, status, chunk_count, indexed_at, created_at, updated_at, metadata
      `,
      [documentId, category]
    );

    if (!result.rows[0]) {
      return null;
    }

    return mapDocumentRow(result.rows[0]);
  },

  async updateDocumentStatus(documentId: string, status: IndexStatus, errorMessage?: string | null) {
    const connection = requirePool();
    await connection.query(
      `
      UPDATE thor_knowledge_documents
      SET status = $2,
          indexed_at = CASE WHEN $2 = 'ready' THEN NOW() ELSE indexed_at END,
          last_error = $3,
          updated_at = NOW()
      WHERE id = $1
      `,
      [documentId, status, errorMessage || null]
    );
  },

  async replaceDocumentChunks(documentId: string, chunks: CreateKnowledgeChunkInput[]) {
    return withTransaction(async (client) => {
      await client.query(`DELETE FROM thor_knowledge_chunks WHERE document_id = $1`, [documentId]);

      for (const chunk of chunks) {
        await client.query(
          `
          INSERT INTO thor_knowledge_chunks
            (document_id, chunk_index, content, page_number, embedding, metadata)
          VALUES ($1, $2, $3, $4, $5::vector, $6)
          `,
          [
            documentId,
            chunk.chunkIndex,
            chunk.content,
            chunk.pageNumber,
            vectorLiteral(chunk.embedding),
            chunk.metadata,
          ]
        );
      }

      await client.query(
        `
        UPDATE thor_knowledge_documents
        SET chunk_count = $2,
            updated_at = NOW()
        WHERE id = $1
        `,
        [documentId, chunks.length]
      );

      return chunks.length;
    });
  },

  async searchByVector(vector: number[], query: SearchQuery) {
    const connection = requirePool();
    const result = await connection.query(
      `
      SELECT
        c.id AS chunk_id,
        c.document_id,
        c.content,
        c.page_number,
        c.chunk_index,
        c.metadata AS chunk_metadata,
        d.id AS doc_id,
        d.name AS doc_name,
        d.category AS doc_category,
        d.indexed_at AS doc_indexed_at,
        d.status AS doc_status,
        1 - (c.embedding <=> $1::vector) AS score
      FROM thor_knowledge_chunks c
      INNER JOIN thor_knowledge_documents d ON d.id = c.document_id
      WHERE d.status = 'ready'
        AND ($2::text IS NULL OR d.category = $2::text)
      ORDER BY c.embedding <=> $1::vector
      LIMIT $3
      `,
      [vectorLiteral(vector), query.category || null, query.limit || 6]
    );

    return result.rows.map(
      (row): SearchResultChunk => ({
        score: Number(row.score),
        chunk: {
          id: row.chunk_id,
          documentId: row.document_id,
          content: row.content,
          pageNumber: row.page_number,
          chunkIndex: row.chunk_index,
          metadata: row.chunk_metadata || {},
        },
        document: {
          id: row.doc_id,
          name: row.doc_name,
          category: row.doc_category,
          indexedAt: row.doc_indexed_at ? new Date(row.doc_indexed_at).toISOString() : null,
          status: row.doc_status,
        },
      })
    );
  },

  async getDocumentById(documentId: string) {
    const connection = requirePool();
    const result = await connection.query(
      `
      SELECT id, name, category, source_type, status, chunk_count, indexed_at, created_at, updated_at, metadata
      FROM thor_knowledge_documents
      WHERE id = $1
      `,
      [documentId]
    );

    if (!result.rows[0]) {
      return null;
    }

    return mapDocumentRow(result.rows[0]);
  },

  async deleteDocument(documentId: string) {
    const connection = requirePool();

    await withTransaction(async (client) => {
      await client.query(`DELETE FROM thor_knowledge_chunks WHERE document_id = $1`, [documentId]);
      await client.query(`DELETE FROM thor_knowledge_documents WHERE id = $1`, [documentId]);
    });

    thorLogger.info("knowledge-repository", "document-deleted", { documentId, hasConnection: Boolean(connection) });
  },
};
