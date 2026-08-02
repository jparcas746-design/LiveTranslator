import { postgresSignipediaRepository } from "@/thor/signipedia/database/postgresRepository";
import { inMemorySignipediaRepository } from "@/thor/signipedia/database/inMemoryRepository";
import type { SignipediaRepository } from "@/thor/signipedia/database/repository";

let resolved: SignipediaRepository | null = null;

export function resolveSignipediaRepository() {
  if (resolved) {
    return resolved;
  }

  resolved = postgresSignipediaRepository.isConfigured()
    ? postgresSignipediaRepository
    : inMemorySignipediaRepository;

  return resolved;
}
