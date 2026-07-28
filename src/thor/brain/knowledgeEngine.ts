import { KnowledgeIngestPipeline } from "@/thor/knowledge/ingest/pipeline";
import { KnowledgeSearchEngine } from "@/thor/knowledge/search/searchEngine";
import { resolveKnowledgeRepository } from "@/thor/knowledge/database/resolveRepository";
import type { IngestDocumentInput, SearchQuery } from "@/thor/knowledge/types";

export class KnowledgeEngine {
  private readonly repository = resolveKnowledgeRepository();
  private readonly ingestPipeline = new KnowledgeIngestPipeline(this.repository);
  private readonly searchEngine = new KnowledgeSearchEngine(this.repository);

  isConfigured() {
    return this.repository.isConfigured();
  }

  ensureConfigured() {
    return;
  }

  async listDocuments() {
    this.ensureConfigured();
    return this.repository.listDocuments();
  }

  async ingest(input: IngestDocumentInput) {
    this.ensureConfigured();
    return this.ingestPipeline.ingestDocument(input);
  }

  async deleteDocument(documentId: string) {
    this.ensureConfigured();
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
