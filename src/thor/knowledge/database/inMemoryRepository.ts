import type {
  IndexStatus,
  KnowledgeDocument,
  SearchQuery,
  SearchResultChunk,
} from "@/thor/knowledge/types";
import type {
  CreateKnowledgeChunkInput,
  CreateKnowledgeDocumentInput,
  KnowledgeRepository,
  ListKnowledgeDocumentsQuery,
} from "@/thor/knowledge/database/repository";

type InMemoryChunk = CreateKnowledgeChunkInput & {
  id: string;
};

type InMemoryKnowledgeStore = {
  documents: Map<string, KnowledgeDocument>;
  chunksByDocument: Map<string, InMemoryChunk[]>;
};

function getStore(): InMemoryKnowledgeStore {
  const globalScope = globalThis as typeof globalThis & {
    __thorKnowledgeMemoryStore?: InMemoryKnowledgeStore;
  };

  if (!globalScope.__thorKnowledgeMemoryStore) {
    globalScope.__thorKnowledgeMemoryStore = {
      documents: new Map<string, KnowledgeDocument>(),
      chunksByDocument: new Map<string, InMemoryChunk[]>(),
    };
  }

  return globalScope.__thorKnowledgeMemoryStore;
}

const store = getStore();
const { documents, chunksByDocument } = store;

function createId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cosineSimilarity(a: number[], b: number[]) {
  if (!a.length || !b.length || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export const inMemoryKnowledgeRepository: KnowledgeRepository = {
  isConfigured() {
    return true;
  },

  async listDocuments(query?: ListKnowledgeDocumentsQuery) {
    const limit = Math.max(1, Math.min(200, Math.floor(query?.limit || 50)));
    const offset = Math.max(0, Math.floor(query?.offset || 0));
    const category = query?.category?.trim();
    const status = query?.status;
    const search = query?.search?.trim().toLowerCase();

    return Array.from(documents.values()).sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt)
    )
      .filter((doc) => (category ? doc.category === category : true))
      .filter((doc) => (status ? doc.status === status : true))
      .filter((doc) => (search ? doc.name.toLowerCase().includes(search) : true))
      .slice(offset, offset + limit);
  },

  async createDocument(input: CreateKnowledgeDocumentInput) {
    const now = new Date().toISOString();
    const document: KnowledgeDocument = {
      id: createId(),
      name: input.name,
      category: input.category,
      sourceType: input.sourceType,
      status: "queued",
      chunkCount: 0,
      fileSizeBytes: input.fileSizeBytes,
      filePath: input.filePath,
      uploadedAt: input.uploadedAt,
      indexedAt: null,
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata,
    };

    documents.set(document.id, document);
    chunksByDocument.set(document.id, []);
    return document;
  },

  async updateDocumentCategory(documentId: string, category: string) {
    const document = documents.get(documentId);
    if (!document) {
      return null;
    }

    const next = {
      ...document,
      category,
      updatedAt: new Date().toISOString(),
    };

    documents.set(documentId, next);
    return next;
  },

  async updateDocumentStatus(documentId: string, status: IndexStatus) {
    const document = documents.get(documentId);
    if (!document) {
      return;
    }

    documents.set(documentId, {
      ...document,
      status,
      indexedAt: status === "ready" ? new Date().toISOString() : document.indexedAt,
      updatedAt: new Date().toISOString(),
    });
  },

  async replaceDocumentChunks(documentId: string, chunks: CreateKnowledgeChunkInput[]) {
    const mapped = chunks.map((chunk) => ({ ...chunk, id: createId() }));
    chunksByDocument.set(documentId, mapped);

    const document = documents.get(documentId);
    if (document) {
      documents.set(documentId, {
        ...document,
        chunkCount: chunks.length,
        updatedAt: new Date().toISOString(),
      });
    }

    return chunks.length;
  },

  async searchByVector(vector: number[], query: SearchQuery) {
    const candidates: SearchResultChunk[] = [];

    for (const [documentId, chunks] of chunksByDocument.entries()) {
      const document = documents.get(documentId);
      if (!document || document.status !== "ready") {
        continue;
      }

      if (query.category && document.category !== query.category) {
        continue;
      }

      for (const chunk of chunks) {
        candidates.push({
          score: cosineSimilarity(vector, chunk.embedding),
          chunk: {
            id: chunk.id,
            documentId,
            content: chunk.content,
            pageNumber: chunk.pageNumber,
            chunkIndex: chunk.chunkIndex,
            metadata: chunk.metadata,
          },
          document: {
            id: document.id,
            name: document.name,
            category: document.category,
            indexedAt: document.indexedAt,
            status: document.status,
          },
        });
      }
    }

    return candidates
      .sort((left, right) => right.score - left.score)
      .slice(0, query.limit || 6);
  },

  async getDocumentById(documentId: string) {
    return documents.get(documentId) || null;
  },

  async deleteDocument(documentId: string) {
    documents.delete(documentId);
    chunksByDocument.delete(documentId);
  },
};
