import { resolveEmbeddingProvider } from "@/thor/knowledge/embeddings/provider";

export function getThorProviders() {
  return {
    embeddings: resolveEmbeddingProvider(),
  };
}
