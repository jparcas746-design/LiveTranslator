import { inMemoryKnowledgeRepository } from "@/thor/knowledge/database/inMemoryRepository";
import { postgresKnowledgeRepository } from "@/thor/knowledge/database/postgresRepository";

export function resolveKnowledgeRepository() {
  if (postgresKnowledgeRepository.isConfigured()) {
    return postgresKnowledgeRepository;
  }

  return inMemoryKnowledgeRepository;
}
