import { localFileKnowledgeRepository } from "@/thor/knowledge/database/localFileRepository";
import { postgresKnowledgeRepository } from "@/thor/knowledge/database/postgresRepository";

export function resolveKnowledgeRepository() {
  if (postgresKnowledgeRepository.isConfigured()) {
    return postgresKnowledgeRepository;
  }

  return localFileKnowledgeRepository;
}
