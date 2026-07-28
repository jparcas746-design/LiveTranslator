// Vector search engine independent of chat/AI providers.
import type { KnowledgeRepository } from "@/thor/knowledge/database/repository";
import { resolveEmbeddingProvider } from "@/thor/knowledge/embeddings/provider";
import type { SearchQuery, SearchResult } from "@/thor/knowledge/types";

export class KnowledgeSearchEngine {
  constructor(private readonly repository: KnowledgeRepository) {}

  async search(query: SearchQuery): Promise<SearchResult> {
    const provider = resolveEmbeddingProvider();
    const embedding = await provider.embedText(query.query);
    const chunks = await this.repository.searchByVector(embedding, query);

    return {
      query: query.query,
      total: chunks.length,
      chunks,
    };
  }
}
