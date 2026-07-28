import { promises as fs } from "node:fs";
import path from "node:path";
import {
  createRepositoryNotConfiguredError,
  type CreateKnowledgeChunkInput,
  type CreateKnowledgeDocumentInput,
  type KnowledgeRepository,
  type ListKnowledgeDocumentsQuery,
} from "@/thor/knowledge/database/repository";
import type {
  IndexStatus,
  KnowledgeDocument,
  SearchQuery,
  SearchResultChunk,
} from "@/thor/knowledge/types";

type StoredChunk = CreateKnowledgeChunkInput & {
  id: string;
};

type PersistedState = {
  version: 1;
  documents: KnowledgeDocument[];
  chunks: Record<string, StoredChunk[]>;
};

type RuntimeStore = {
  initialized: boolean;
  loading: Promise<void> | null;
  writing: Promise<void>;
  documents: Map<string, KnowledgeDocument>;
  chunksByDocument: Map<string, StoredChunk[]>;
};

const runtimeStore: RuntimeStore = {
  initialized: false,
  loading: null,
  writing: Promise.resolve(),
  documents: new Map<string, KnowledgeDocument>(),
  chunksByDocument: new Map<string, StoredChunk[]>(),
};

function resolveDbPath() {
  const configured = process.env.THOR_KNOWLEDGE_LOCAL_DB_PATH?.trim();
  if (configured) {
    return path.resolve(configured);
  }

  if (process.env.VERCEL === "1") {
    return null;
  }

  return path.resolve(process.cwd(), ".thor-knowledge-storage", "knowledge-db.json");
}

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

async function loadState() {
  const dbPath = resolveDbPath();
  if (!dbPath) {
    throw createRepositoryNotConfiguredError();
  }

  try {
    const text = await fs.readFile(dbPath, "utf8");
    const parsed = JSON.parse(text) as PersistedState;

    if (parsed?.version !== 1) {
      return;
    }

    runtimeStore.documents = new Map((parsed.documents || []).map((document) => [document.id, document]));
    runtimeStore.chunksByDocument = new Map(
      Object.entries(parsed.chunks || {}).map(([documentId, chunks]) => [documentId, chunks || []])
    );
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }
}

function serializeState(): PersistedState {
  const chunks: Record<string, StoredChunk[]> = {};
  for (const [documentId, values] of runtimeStore.chunksByDocument.entries()) {
    chunks[documentId] = values;
  }

  return {
    version: 1,
    documents: Array.from(runtimeStore.documents.values()),
    chunks,
  };
}

async function persistState() {
  const dbPath = resolveDbPath();
  if (!dbPath) {
    throw createRepositoryNotConfiguredError();
  }

  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  const payload = `${JSON.stringify(serializeState())}\n`;
  const tempPath = `${dbPath}.tmp`;
  await fs.writeFile(tempPath, payload, "utf8");
  await fs.rename(tempPath, dbPath);
}

async function ensureInitialized() {
  if (runtimeStore.initialized) {
    return;
  }

  if (!runtimeStore.loading) {
    runtimeStore.loading = (async () => {
      await loadState();
      runtimeStore.initialized = true;
    })().finally(() => {
      runtimeStore.loading = null;
    });
  }

  await runtimeStore.loading;
}

function queuePersist() {
  runtimeStore.writing = runtimeStore.writing.then(async () => {
    await persistState();
  });

  return runtimeStore.writing;
}

export const localFileKnowledgeRepository: KnowledgeRepository = {
  isConfigured() {
    if (process.env.VERCEL === "1") {
      return false;
    }

    return Boolean(resolveDbPath());
  },

  async listDocuments(query?: ListKnowledgeDocumentsQuery) {
    await ensureInitialized();
    const limit = Math.max(1, Math.min(200, Math.floor(query?.limit || 50)));
    const offset = Math.max(0, Math.floor(query?.offset || 0));
    const category = query?.category?.trim();
    const status = query?.status;
    const search = query?.search?.trim().toLowerCase();

    return Array.from(runtimeStore.documents.values())
      .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt))
      .filter((doc) => (category ? doc.category === category : true))
      .filter((doc) => (status ? doc.status === status : true))
      .filter((doc) => (search ? doc.name.toLowerCase().includes(search) : true))
      .slice(offset, offset + limit);
  },

  async createDocument(input: CreateKnowledgeDocumentInput) {
    await ensureInitialized();
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

    runtimeStore.documents.set(document.id, document);
    runtimeStore.chunksByDocument.set(document.id, []);
    await queuePersist();
    return document;
  },

  async updateDocumentCategory(documentId: string, category: string) {
    await ensureInitialized();
    const document = runtimeStore.documents.get(documentId);
    if (!document) {
      return null;
    }

    const updated: KnowledgeDocument = {
      ...document,
      category,
      updatedAt: new Date().toISOString(),
    };

    runtimeStore.documents.set(documentId, updated);
    await queuePersist();
    return updated;
  },

  async updateDocumentStatus(documentId: string, status: IndexStatus, errorMessage?: string | null) {
    await ensureInitialized();
    const document = runtimeStore.documents.get(documentId);
    if (!document) {
      return;
    }

    const metadata = {
      ...document.metadata,
      lastError: errorMessage || null,
    };

    runtimeStore.documents.set(documentId, {
      ...document,
      status,
      metadata,
      indexedAt: status === "ready" ? new Date().toISOString() : document.indexedAt,
      updatedAt: new Date().toISOString(),
    });

    await queuePersist();
  },

  async replaceDocumentChunks(documentId: string, chunks: CreateKnowledgeChunkInput[]) {
    await ensureInitialized();
    const mapped = chunks.map((chunk) => ({ ...chunk, id: createId() }));
    runtimeStore.chunksByDocument.set(documentId, mapped);

    const document = runtimeStore.documents.get(documentId);
    if (document) {
      runtimeStore.documents.set(documentId, {
        ...document,
        chunkCount: mapped.length,
        updatedAt: new Date().toISOString(),
      });
    }

    await queuePersist();
    return mapped.length;
  },

  async searchByVector(vector: number[], query: SearchQuery) {
    await ensureInitialized();
    const candidates: SearchResultChunk[] = [];

    for (const [documentId, chunks] of runtimeStore.chunksByDocument.entries()) {
      const document = runtimeStore.documents.get(documentId);
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
    await ensureInitialized();
    return runtimeStore.documents.get(documentId) || null;
  },

  async deleteDocument(documentId: string) {
    await ensureInitialized();
    runtimeStore.documents.delete(documentId);
    runtimeStore.chunksByDocument.delete(documentId);
    await queuePersist();
  },
};
