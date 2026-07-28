import type { ChunkingOptions } from "@/thor/knowledge/types";

export const DEFAULT_CHUNKING_OPTIONS: ChunkingOptions = {
  chunkSize: 1200,
  overlapSize: 220,
  minChunkLength: 120,
};

export function normalizeText(rawText: string) {
  return rawText
    .replace(/\u0000/g, " ")
    .replace(/[\t\r]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

export function splitTextIntoChunks(text: string, options: ChunkingOptions = DEFAULT_CHUNKING_OPTIONS) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return [];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    const end = Math.min(start + options.chunkSize, normalized.length);
    const candidate = normalized.slice(start, end).trim();

    if (candidate.length >= options.minChunkLength) {
      chunks.push(candidate);
    }

    if (end >= normalized.length) {
      break;
    }

    start = Math.max(end - options.overlapSize, start + 1);
  }

  return chunks;
}
