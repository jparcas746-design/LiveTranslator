// Ingestion pipeline: parse source, normalize text, chunk, and persist.
import { resolveParser } from "@/thor/knowledge/ingest/parsers";
import type { IngestDocumentInput, IngestedDocumentResult } from "@/thor/knowledge/types";
import { thorLogger } from "@/thor/utils/logger";
import { normalizeText, splitTextIntoChunks } from "@/thor/utils/text";
import type { KnowledgeRepository } from "@/thor/knowledge/database/repository";
import { resolveEmbeddingProvider } from "@/thor/knowledge/embeddings/provider";

function buildZeroVector() {
  const dimensions = Number(process.env.THOR_EMBED_DIM || 768);
  const resolved = Number.isFinite(dimensions) && dimensions > 0 ? dimensions : 768;
  return new Array(resolved).fill(0);
}

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
      thorLogger.info("knowledge-ingest", "extracting-text", {
        documentId: document.id,
        sourceType: input.sourceType,
        fileName: input.fileName,
      });

      const extracted = await parser.parse(input.fileBuffer);

      thorLogger.info("knowledge-ingest", "text-extracted", {
        documentId: document.id,
        textLength: extracted.text.length,
      });

      const cleanedText = normalizeText(extracted.text);
      const chunkContents = splitTextIntoChunks(cleanedText);
      let embeddings: number[][] = [];

      try {
        const embeddingProvider = resolveEmbeddingProvider();
        embeddings = await embeddingProvider.embedBatch(chunkContents);

        thorLogger.info("knowledge-ingest", "embeddings-generated", {
          documentId: document.id,
          provider: embeddingProvider.name,
          chunkCount: embeddings.length,
        });
      } catch (embeddingError) {
        const reason = embeddingError instanceof Error ? embeddingError.message : String(embeddingError);
        const zeroVector = buildZeroVector();
        embeddings = chunkContents.map(() => [...zeroVector]);

        thorLogger.warn("knowledge-ingest", "embeddings-fallback-zero", {
          documentId: document.id,
          reason,
          chunkCount: embeddings.length,
        });
      }

      thorLogger.info("knowledge-ingest", "chunks-generated", {
        documentId: document.id,
        chunkCount: chunkContents.length,
      });

      const chunks = chunkContents.map((content, index) => ({
        documentId: document.id,
        chunkIndex: index,
        content,
        pageNumber: null,
        embedding: embeddings[index] || buildZeroVector(),
        metadata: {
          sourceName: input.fileName,
          category,
          indexedAt: new Date().toISOString(),
        },
      }));

      thorLogger.info("knowledge-ingest", "persisting-chunks", {
        documentId: document.id,
        chunkCount: chunks.length,
      });

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
