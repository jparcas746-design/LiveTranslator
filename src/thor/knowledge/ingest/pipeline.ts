// Ingestion pipeline: parse source, normalize text, chunk, and persist.
import { resolveParser } from "@/thor/knowledge/ingest/parsers";
import type { IngestDocumentInput, IngestedDocumentResult } from "@/thor/knowledge/types";
import { thorLogger } from "@/thor/utils/logger";
import { normalizeText, splitTextIntoChunks } from "@/thor/utils/text";
import type { KnowledgeRepository } from "@/thor/knowledge/database/repository";
import { resolveEmbeddingProvider } from "@/thor/knowledge/embeddings/provider";
import { resolveKnowledgeSourceStorage } from "@/thor/knowledge/storage";

function buildZeroVector() {
  const dimensions = Number(process.env.THOR_EMBED_DIM || 768);
  const resolved = Number.isFinite(dimensions) && dimensions > 0 ? dimensions : 768;
  return new Array(resolved).fill(0);
}

export class KnowledgeIngestPipeline {
  constructor(private readonly repository: KnowledgeRepository) {}

  private async buildChunks(fileName: string, sourceType: string, category: string, fileBuffer: Buffer, documentId: string) {
    const parser = resolveParser(sourceType as IngestDocumentInput["sourceType"]);
    thorLogger.info("knowledge-ingest", "extracting-text", {
      documentId,
      sourceType,
      fileName,
    });

    const extracted = await parser.parse(fileBuffer);

    thorLogger.info("knowledge-ingest", "text-extracted", {
      documentId,
      textLength: extracted.text.length,
    });

    const cleanedText = normalizeText(extracted.text);
    const chunkContents = splitTextIntoChunks(cleanedText);
    let embeddings: number[][] = [];

    try {
      const embeddingProvider = resolveEmbeddingProvider();
      embeddings = await embeddingProvider.embedBatch(chunkContents);

      thorLogger.info("knowledge-ingest", "embeddings-generated", {
        documentId,
        provider: embeddingProvider.name,
        chunkCount: embeddings.length,
      });
    } catch (embeddingError) {
      const reason = embeddingError instanceof Error ? embeddingError.message : String(embeddingError);
      const zeroVector = buildZeroVector();
      embeddings = chunkContents.map(() => [...zeroVector]);

      thorLogger.warn("knowledge-ingest", "embeddings-fallback-zero", {
        documentId,
        reason,
        chunkCount: embeddings.length,
      });
    }

    thorLogger.info("knowledge-ingest", "chunks-generated", {
      documentId,
      chunkCount: chunkContents.length,
    });

    return chunkContents.map((content, index) => ({
      documentId,
      chunkIndex: index,
      content,
      pageNumber: null,
      embedding: embeddings[index] || buildZeroVector(),
      metadata: {
        sourceName: fileName,
        sourceType,
        category,
        indexedAt: new Date().toISOString(),
      },
    }));
  }

  private async indexDocumentContent(input: {
    documentId: string;
    fileName: string;
    sourceType: IngestDocumentInput["sourceType"];
    category: string;
    fileBuffer: Buffer;
  }) {
    const chunks = await this.buildChunks(
      input.fileName,
      input.sourceType,
      input.category,
      input.fileBuffer,
      input.documentId
    );

    thorLogger.info("knowledge-ingest", "persisting-chunks", {
      documentId: input.documentId,
      chunkCount: chunks.length,
    });

    const chunkCount = await this.repository.replaceDocumentChunks(input.documentId, chunks);
    await this.repository.updateDocumentStatus(input.documentId, "ready", null);
    return chunkCount;
  }

  async ingestDocument(input: IngestDocumentInput): Promise<IngestedDocumentResult> {
    const category = input.category || "general";
    const uploadedAt = new Date().toISOString();
    const storage = resolveKnowledgeSourceStorage();
    const storedFile = await storage.saveSource({
      fileName: input.fileName,
      fileBuffer: input.fileBuffer,
      category,
      sourceType: input.sourceType,
      uploadedAt,
    });

    const document = await this.repository.createDocument({
      name: input.fileName,
      category,
      sourceType: input.sourceType,
      filePath: storedFile.filePath,
      fileSizeBytes: storedFile.fileSizeBytes,
      uploadedAt,
      metadata: input.metadata || {},
    });

    await this.repository.updateDocumentStatus(document.id, "indexing");

    try {
      const chunkCount = await this.indexDocumentContent({
        documentId: document.id,
        fileName: input.fileName,
        sourceType: input.sourceType,
        category,
        fileBuffer: input.fileBuffer,
      });

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

    const storage = resolveKnowledgeSourceStorage();
    await this.repository.updateDocumentStatus(documentId, "indexing", null);

    try {
      const sourceBuffer = await storage.readSource(existing.filePath);
      await this.indexDocumentContent({
        documentId,
        fileName: existing.name,
        sourceType: existing.sourceType,
        category: existing.category,
        fileBuffer: sourceBuffer,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.repository.updateDocumentStatus(documentId, "failed", reason);
      throw error;
    }
  }
}
