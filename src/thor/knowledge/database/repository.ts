import type {
  EmbeddingVector,
  IndexStatus,
  KnowledgeChunk,
  KnowledgeDocument,
  SearchQuery,
  SearchResultChunk,
  SourceType,
} from "@/thor/knowledge/types";

export type CreateKnowledgeDocumentInput = {
  name: string;
  category: string;
  sourceType: SourceType;
  fileSizeBytes: number;
  filePath: string;
  uploadedAt: string;
  metadata: Record<string, unknown>;
};

export type ListKnowledgeDocumentsQuery = {
  limit?: number;
  offset?: number;
  category?: string;
  status?: IndexStatus;
  search?: string;
};

export type CreateKnowledgeChunkInput = {
  documentId: string;
  content: string;
  pageNumber: number | null;
  chunkIndex: number;
  embedding: EmbeddingVector;
  metadata: Record<string, unknown>;
};

export type KnowledgeRepository = {
  isConfigured: () => boolean;
  listDocuments: (query?: ListKnowledgeDocumentsQuery) => Promise<KnowledgeDocument[]>;
  createDocument: (input: CreateKnowledgeDocumentInput) => Promise<KnowledgeDocument>;
  updateDocumentCategory: (documentId: string, category: string) => Promise<KnowledgeDocument | null>;
  updateDocumentStatus: (documentId: string, status: IndexStatus, errorMessage?: string | null) => Promise<void>;
  replaceDocumentChunks: (documentId: string, chunks: CreateKnowledgeChunkInput[]) => Promise<number>;
  searchByVector: (
    vector: EmbeddingVector,
    query: SearchQuery
  ) => Promise<SearchResultChunk[]>;
  getDocumentById: (documentId: string) => Promise<KnowledgeDocument | null>;
  deleteDocument: (documentId: string) => Promise<void>;
};

export type RepositoryCapabilityError = {
  code: "KNOWLEDGE_DB_NOT_CONFIGURED";
  message: string;
};

export function createRepositoryNotConfiguredError(): RepositoryCapabilityError {
  return {
    code: "KNOWLEDGE_DB_NOT_CONFIGURED",
    message:
      "Knowledge Engine database is not configured. Set DATABASE_URL to a valid PostgreSQL connection string and run the pgvector schema.",
  };
}

export function buildChunkMetadata(chunk: KnowledgeChunk) {
  return {
    page: chunk.pageNumber,
    chunkIndex: chunk.chunkIndex,
    ...chunk.metadata,
  };
}
