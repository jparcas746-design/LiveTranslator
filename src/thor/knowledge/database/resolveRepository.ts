import { postgresKnowledgeRepository } from "@/thor/knowledge/database/postgresRepository";

export function resolveKnowledgeRepository() {
  return postgresKnowledgeRepository;
}
