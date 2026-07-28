import { KnowledgeIngestPipeline } from "@/thor/knowledge/ingest/pipeline";
import { KnowledgeSearchEngine } from "@/thor/knowledge/search/searchEngine";
import { postgresKnowledgeRepository } from "@/thor/knowledge/database/postgresRepository";
import { createRepositoryNotConfiguredError } from "@/thor/knowledge/database/repository";
import type { IngestDocumentInput, SearchQuery } from "@/thor/knowledge/types";

export class KnowledgeEngine {
  private readonly ingestPipeline = new KnowledgeIngestPipeline(postgresKnowledgeRepository);
  private readonly searchEngine = new KnowledgeSearchEngine(postgresKnowledgeRepository);

  isConfigured() {
    return postgresKnowledgeRepository.isConfigured();
  }

  ensureConfigured() {
    if (!this.isConfigured()) {
      throw createRepositoryNotConfiguredError();
    }
  }

  async listDocuments() {
    this.ensureConfigured();
    return postgresKnowledgeRepository.listDocuments();
  }

  async ingest(input: IngestDocumentInput) {
    this.ensureConfigured();
    return this.ingestPipeline.ingestDocument(input);
  }

  async deleteDocument(documentId: string) {
    this.ensureConfigured();
    return postgresKnowledgeRepository.deleteDocument(documentId);
  }

  async updateDocumentCategory(documentId: string, category: string) {
    this.ensureConfigured();
    const updated = await postgresKnowledgeRepository.updateDocumentCategory(documentId, category);
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
