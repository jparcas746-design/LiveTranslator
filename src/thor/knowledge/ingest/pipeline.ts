// Ingestion pipeline: parse source, normalize text, chunk, embed, and persist.
import { resolveEmbeddingProvider } from "@/thor/knowledge/embeddings/provider";
import { resolveParser } from "@/thor/knowledge/ingest/parsers";
import type { IngestDocumentInput, IngestedDocumentResult } from "@/thor/knowledge/types";
import { thorLogger } from "@/thor/utils/logger";
import { normalizeText, splitTextIntoChunks } from "@/thor/utils/text";
import type { KnowledgeRepository } from "@/thor/knowledge/database/repository";

export class KnowledgeIngestPipeline {
  constructor(private readonly repository: KnowledgeRepository) {}

  async ingestDocument(input: IngestDocumentInput): Promise<IngestedDocumentResult> {
    const category = input.category || "general";
    const document = await this.repository.createDocument({
      name: input.fileName,
      category,
      sourceType: input.sourceType,
      metadata: input.metadata || {},
    });

    await this.repository.updateDocumentStatus(document.id, "indexing");

    try {
      const parser = resolveParser(input.sourceType);
      const extracted = await parser.parse(input.fileBuffer);
      const cleanedText = normalizeText(extracted.text);
      const chunkContents = splitTextIntoChunks(cleanedText);
      const embeddingProvider = resolveEmbeddingProvider();
      const vectors = await embeddingProvider.embedBatch(chunkContents);

      const chunks = chunkContents.map((content, index) => ({
        documentId: document.id,
        chunkIndex: index,
        content,
        pageNumber: null,
        embedding: vectors[index],
        metadata: {
          sourceName: input.fileName,
          category,
          indexedAt: new Date().toISOString(),
        },
      }));

      const chunkCount = await this.repository.replaceDocumentChunks(document.id, chunks);
      await this.repository.updateDocumentStatus(document.id, "ready", null);

      thorLogger.info("knowledge-ingest", "document-indexed", {
        documentId: document.id,
        name: input.fileName,
        category,
        chunkCount,
      });

      const refreshed = await this.repository.getDocumentById(document.id);
      if (!refreshed) {
        throw new Error("Indexed document could not be loaded from repository");
      }

      return {
        document: refreshed,
        chunkCount,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.repository.updateDocumentStatus(document.id, "failed", reason);

      thorLogger.error("knowledge-ingest", "document-index-failed", {
        documentId: document.id,
        reason,
      });

      throw error;
    }
  }

  async reindexDocument(documentId: string) {
    const existing = await this.repository.getDocumentById(documentId);
    if (!existing) {
      throw new Error("Document not found");
    }

    throw new Error(
      "Reindex requires source retrieval storage. Add blob storage connector and link source file by document ID."
    );
  }
}
