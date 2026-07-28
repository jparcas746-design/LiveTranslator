import { KnowledgeIngestPipeline } from "@/thor/knowledge/ingest/pipeline";
import { KnowledgeSearchEngine } from "@/thor/knowledge/search/searchEngine";
import { resolveKnowledgeRepository } from "@/thor/knowledge/database/resolveRepository";
import type { IngestDocumentInput, SearchQuery } from "@/thor/knowledge/types";
import { createRepositoryNotConfiguredError, type ListKnowledgeDocumentsQuery } from "@/thor/knowledge/database/repository";
import { createStorageNotConfiguredError, resolveKnowledgeSourceStorage } from "@/thor/knowledge/storage";

export class KnowledgeEngine {
  private readonly repository = resolveKnowledgeRepository();
  private readonly ingestPipeline = new KnowledgeIngestPipeline(this.repository);
  private readonly searchEngine = new KnowledgeSearchEngine(this.repository);

  isConfigured() {
    return this.repository.isConfigured() && resolveKnowledgeSourceStorage().isConfigured();
  }

  ensureConfigured() {
    if (!this.repository.isConfigured()) {
      throw createRepositoryNotConfiguredError();
    }

    const storage = resolveKnowledgeSourceStorage();
    if (!storage.isConfigured()) {
      throw createStorageNotConfiguredError();
    }
  }

  async listDocuments(query?: ListKnowledgeDocumentsQuery) {
    this.ensureConfigured();
    return this.repository.listDocuments(query);
  }

  async ingest(input: IngestDocumentInput) {
    this.ensureConfigured();
    return this.ingestPipeline.ingestDocument(input);
  }

  async deleteDocument(documentId: string) {
    this.ensureConfigured();
    const existing = await this.repository.getDocumentById(documentId);
    if (!existing) {
      throw new Error("Document not found");
    }

    const storage = resolveKnowledgeSourceStorage();
    await storage.deleteSource(existing.filePath);
    return this.repository.deleteDocument(documentId);
  }

  async updateDocumentCategory(documentId: string, category: string) {
    this.ensureConfigured();
    const updated = await this.repository.updateDocumentCategory(documentId, category);
    if (!updated) {
      throw new Error("Document not found");
    }

    return updated;
  }

  async reindexDocument(documentId: string) {
    this.ensureConfigured();
    return this.ingestPipeline.reindexDocument(documentId);
  }

  async search(query: SearchQuery) {
    this.ensureConfigured();
    return this.searchEngine.search(query);
  }
}

let engine: KnowledgeEngine | null = null;

export function getKnowledgeEngine() {
  if (!engine) {
    engine = new KnowledgeEngine();
  }
  return engine;
}
