// Canonical domain types for the ThorAI Knowledge Engine.
export type SourceType = "pdf" | "word" | "powerpoint" | "markdown" | "epub" | "text" | "html" | "web" | "image" | "video";

export type IndexStatus = "queued" | "indexing" | "ready" | "failed";

export type KnowledgeDocument = {
  id: string;
  name: string;
  category: string;
  sourceType: SourceType;
  status: IndexStatus;
  chunkCount: number;
  indexedAt: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
};

export type KnowledgeChunk = {
  id: string;
  documentId: string;
  content: string;
  pageNumber: number | null;
  chunkIndex: number;
  metadata: Record<string, unknown>;
};

export type IngestDocumentInput = {
  fileName: string;
  sourceType: SourceType;
  category?: string;
  fileBuffer: Buffer;
  metadata?: Record<string, unknown>;
};

export type ExtractedDocument = {
  text: string;
  pageTexts?: Array<{ pageNumber: number; text: string }>;
};

export type ChunkingOptions = {
  chunkSize: number;
  overlapSize: number;
  minChunkLength: number;
};

export type IngestedDocumentResult = {
  document: KnowledgeDocument;
  chunkCount: number;
};

export type SearchQuery = {
  query: string;
  limit?: number;
  category?: string;
};

export type SearchResultChunk = {
  chunk: KnowledgeChunk;
  score: number;
  document: Pick<KnowledgeDocument, "id" | "name" | "category" | "indexedAt" | "status">;
};

export type SearchResult = {
  query: string;
  total: number;
  chunks: SearchResultChunk[];
};

export type EmbeddingVector = number[];

export type EmbeddingProvider = {
  name: string;
  dimensions: number;
  embedText: (text: string) => Promise<EmbeddingVector>;
  embedBatch: (texts: string[]) => Promise<EmbeddingVector[]>;
};

export type KnowledgeContextPlan = {
  shouldAttachContext: boolean;
  reason: string;
  contextChunks: SearchResultChunk[];
};
