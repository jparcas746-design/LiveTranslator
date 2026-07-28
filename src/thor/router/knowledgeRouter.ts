// Routing planner that decides when knowledge context is strong enough to attach.
import type { SearchResultChunk } from "@/thor/knowledge/types";
import { getKnowledgeEngine } from "@/thor/brain/knowledgeEngine";
import { thorLogger } from "@/thor/utils/logger";

export type KnowledgeRoutingInput = {
  query: string;
  category?: string;
  minScore?: number;
  maxChunks?: number;
};

export type KnowledgeRoutingDecision = {
  shouldAttachContext: boolean;
  reason: string;
  contextChunks: SearchResultChunk[];
};

export async function planKnowledgeContext(
  input: KnowledgeRoutingInput
): Promise<KnowledgeRoutingDecision> {
  const engine = getKnowledgeEngine();

  if (!engine.isConfigured()) {
    return {
      shouldAttachContext: false,
      reason: "knowledge-db-not-configured",
      contextChunks: [],
    };
  }

  try {
    const result = await engine.search({
      query: input.query,
      category: input.category,
      limit: input.maxChunks || 4,
    });

    const threshold = input.minScore ?? 0.62;
    const strong = result.chunks.filter((chunk) => chunk.score >= threshold);

    if (strong.length === 0) {
      return {
        shouldAttachContext: false,
        reason: "no-relevant-context",
        contextChunks: [],
      };
    }

    return {
      shouldAttachContext: true,
      reason: "relevant-context-found",
      contextChunks: strong,
    };
  } catch (error) {
    thorLogger.warn("knowledge-router", "context-planning-failed", {
      reason: error instanceof Error ? error.message : String(error),
    });

    return {
      shouldAttachContext: false,
      reason: "knowledge-search-failed",
      contextChunks: [],
    };
  }
}
