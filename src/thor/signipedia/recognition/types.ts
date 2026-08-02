import type { SearchHit } from "@/thor/signipedia/types";

export type VisionSymbolCandidate = {
  name: string;
  slug?: string;
  glyph?: string;
  confidence: number;
  aliases: string[];
  meaning?: string;
  description?: string;
  context?: string;
};

export type VisionRecognitionOutput = {
  provider: string;
  summary: string;
  candidates: VisionSymbolCandidate[];
  lowConfidence: boolean;
};

export type SymbolVisionProvider = {
  name: string;
  isConfigured: () => boolean;
  recognize: (input: { mimeType: string; imageBase64: string; traceId?: string }) => Promise<VisionRecognitionOutput>;
};

export type HybridMatch = {
  slug: string;
  name: string;
  glyph: string;
  confidence: number;
  meaning: string;
  imageUrl: string | null;
  categoryName: string | null;
  reason: string;
  sourceScore: number;
};

export type SymbolRecognitionResponse = {
  provider: string;
  summary: string;
  lowConfidence: boolean;
  candidates: VisionSymbolCandidate[];
  matches: HybridMatch[];
  bestMatch: HybridMatch | null;
  shouldAutoRedirect: boolean;
  analyzedAt: string;
  warning?: string;
};

export type ScoredMatch = {
  hit: SearchHit;
  score: number;
  reasons: Set<string>;
};
