import { getSignipediaEngine } from "@/thor/signipedia/engine";
import { resolveSymbolVisionProvider } from "@/thor/signipedia/recognition/providers";
import { searchSymbolsByImageEmbedding } from "@/thor/signipedia/recognition/vectorSearch";
import type { HybridMatch, ScoredMatch, SymbolRecognitionResponse, VisionSymbolCandidate } from "@/thor/signipedia/recognition/types";

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function uniqueTerms(values: string[]) {
  const seen = new Set<string>();
  const terms: string[] = [];

  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized || normalized.length < 2 || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    terms.push(value.trim());
  }

  return terms;
}

function collectSearchTerms(candidates: VisionSymbolCandidate[]) {
  const terms: string[] = [];

  for (const candidate of candidates) {
    terms.push(candidate.name);
    if (candidate.slug) terms.push(candidate.slug);
    if (candidate.glyph) terms.push(candidate.glyph);
    if (candidate.meaning) terms.push(candidate.meaning);
    if (candidate.description) terms.push(candidate.description);
    if (candidate.context) terms.push(candidate.context);
    for (const alias of candidate.aliases) {
      terms.push(alias);
    }
  }

  return uniqueTerms(terms)
    .map((term) => term.slice(0, 180))
    .slice(0, 20);
}

function lexicalAffinity(haystack: string, term: string) {
  const normalizedHaystack = normalizeText(haystack);
  const normalizedTerm = normalizeText(term);

  if (!normalizedTerm || !normalizedHaystack) {
    return 0;
  }

  if (normalizedHaystack === normalizedTerm) {
    return 1.5;
  }

  if (normalizedHaystack.includes(normalizedTerm)) {
    return 1;
  }

  if (normalizedTerm.includes(normalizedHaystack) && normalizedHaystack.length >= 3) {
    return 0.4;
  }

  return 0;
}

function candidateWeight(candidate: VisionSymbolCandidate) {
  return 1 + Math.max(0, Math.min(1, candidate.confidence));
}

function buildReason(candidate: VisionSymbolCandidate) {
  if (candidate.glyph) {
    return `Coincidencia visual con glifo ${candidate.glyph}`;
  }

  if (candidate.aliases.length > 0) {
    return `Coincidencia con alias "${candidate.aliases[0]}"`;
  }

  return `Coincidencia textual con "${candidate.name}"`;
}

function logRecognition(stage: string, traceId?: string, details?: Record<string, unknown>) {
  const scope = traceId || "no-trace";
  console.info(`[recognition][${scope}] ${stage}`, details || {});
}

export async function recognizeSymbolFromImage(input: { mimeType: string; imageBase64: string; imageEmbedding?: number[]; traceId?: string }): Promise<SymbolRecognitionResponse> {
  const startedAt = Date.now();
  logRecognition("service_start", input.traceId, {
    mimeType: input.mimeType,
    base64Length: input.imageBase64.length,
  });

  const provider = resolveSymbolVisionProvider();
  logRecognition("provider_resolved", input.traceId, {
    provider: provider.name,
  });

  let vision: {
    provider: string;
    summary: string;
    candidates: VisionSymbolCandidate[];
    lowConfidence: boolean;
  };

  try {
    vision = await provider.recognize(input);
  } catch (providerError) {
    const message = providerError instanceof Error ? providerError.message : String(providerError);
    logRecognition("provider_recognition_failed", input.traceId, {
      error: message,
      hasClientEmbedding: Boolean(input.imageEmbedding?.length),
    });

    if (!input.imageEmbedding?.length) {
      throw providerError;
    }

    vision = {
      provider: `${provider.name}:unavailable`,
      summary: "El proveedor de visión no respondió; continuamos con matching vectorial del embedding recibido.",
      candidates: [],
      lowConfidence: true,
    };
  }

  logRecognition("provider_response_received", input.traceId, {
    provider: vision.provider,
    lowConfidence: vision.lowConfidence,
    candidateCount: vision.candidates.length,
    topCandidates: vision.candidates.slice(0, 5).map((candidate) => ({
      name: candidate.name,
      slug: candidate.slug || null,
      confidence: candidate.confidence,
    })),
  });

  const engine = getSignipediaEngine();

  const candidates = vision.candidates.slice(0, 5);
  const searchTerms = collectSearchTerms(candidates);
  logRecognition("search_terms_collected", input.traceId, {
    terms: searchTerms,
    candidateCount: candidates.length,
  });

  const scoreBySlug = new Map<string, ScoredMatch>();

  for (const candidate of candidates) {
    const weight = candidateWeight(candidate);

    if (candidate.slug) {
      const exact = await engine.getSymbolBySlug(candidate.slug);
      if (exact) {
        const exactHitList = await engine.listSymbols({ query: exact.slug, limit: 1, fuzzy: false });
        const exactHit = exactHitList[0];
        if (exactHit) {
          scoreBySlug.set(exact.slug, {
            hit: exactHit,
            score: 6 * weight,
            reasons: new Set([`Coincidencia exacta por slug (${candidate.slug})`]),
          });
        }
      }
    }
  }

  const termHits = await Promise.all(
    searchTerms.map(async (term) => {
      const hits = await engine.listSymbols({
        query: term,
        language: "es",
        fuzzy: true,
        limit: 30,
      });

      return { term, hits };
    })
  );

  logRecognition("catalog_queries_completed", input.traceId, {
    termCount: termHits.length,
    hitsByTerm: termHits.map((item) => ({ term: item.term, count: item.hits.length })),
  });

  for (const { term, hits } of termHits) {

    for (const hit of hits) {
      const existing = scoreBySlug.get(hit.symbol.slug);
      const compositeText = [
        hit.symbol.name,
        hit.symbol.slug,
        hit.symbol.meaning,
        hit.symbol.description,
        hit.symbol.origin,
        hit.symbol.currentUses,
        hit.symbol.canonicalGlyph,
        ...hit.aliases,
        ...hit.tags,
        ...hit.symbol.synonyms,
      ].join(" ");

      const affinity = lexicalAffinity(compositeText, term);
      const increment = Math.max(0.1, (hit.score + affinity) * 0.8);

      if (!existing) {
        scoreBySlug.set(hit.symbol.slug, {
          hit,
          score: increment,
          reasons: new Set([`Coincidencia por búsqueda híbrida: "${term}"`]),
        });
      } else {
        existing.score += increment;
        existing.reasons.add(`Coincidencia por búsqueda híbrida: "${term}"`);
      }
    }
  }

  for (const candidate of candidates) {
    const boostReason = buildReason(candidate);
    const termsToCheck = [candidate.name, candidate.slug || "", candidate.glyph || "", ...candidate.aliases].filter(Boolean);

    for (const scored of scoreBySlug.values()) {
      const target = [
        scored.hit.symbol.name,
        scored.hit.symbol.slug,
        scored.hit.symbol.canonicalGlyph,
        ...scored.hit.aliases,
        ...scored.hit.symbol.synonyms,
      ].join(" ");

      const localBoost = termsToCheck.reduce((sum, term) => sum + lexicalAffinity(target, term), 0);
      if (localBoost > 0) {
        scored.score += localBoost * candidateWeight(candidate) * 0.7;
        scored.reasons.add(boostReason);
      }
    }
  }

  const ranked = Array.from(scoreBySlug.values()).sort((left, right) => right.score - left.score).slice(0, 8);
  const maxScore = ranked[0]?.score || 1;

  logRecognition("ranking_completed", input.traceId, {
    rankedCount: ranked.length,
    topScores: ranked.slice(0, 5).map((entry) => ({
      slug: entry.hit.symbol.slug,
      score: Number(entry.score.toFixed(4)),
      reasons: Array.from(entry.reasons),
    })),
  });

  const matches: HybridMatch[] = ranked.map((entry) => ({
    slug: entry.hit.symbol.slug,
    name: entry.hit.symbol.name,
    glyph: entry.hit.symbol.canonicalGlyph || "∎",
    confidence: Math.max(0.01, Math.min(0.99, entry.score / maxScore)),
    meaning: entry.hit.symbol.meaning,
    imageUrl: entry.hit.symbol.imageUrl || null,
    categoryName: entry.hit.category?.name || null,
    reason: Array.from(entry.reasons).slice(0, 2).join(" · "),
    sourceScore: entry.score,
  }));

  if (input.imageEmbedding?.length) {
    try {
      logRecognition("vector_search_start", input.traceId, {
        embeddingDimensions: input.imageEmbedding.length,
      });

      const vector = await searchSymbolsByImageEmbedding({
        imageEmbedding: input.imageEmbedding,
        traceId: input.traceId,
        limit: 8,
      });

      const mergedBySlug = new Map(matches.map((match) => [match.slug, match]));

      for (const vectorMatch of vector.matches) {
        const existing = mergedBySlug.get(vectorMatch.slug);
        if (!existing) {
          mergedBySlug.set(vectorMatch.slug, vectorMatch);
          continue;
        }

        existing.confidence = Math.max(existing.confidence, vectorMatch.confidence);
        existing.sourceScore += vectorMatch.sourceScore * 1.2;
        existing.reason = `${vectorMatch.reason} · ${existing.reason}`;
      }

      matches.length = 0;
      matches.push(
        ...Array.from(mergedBySlug.values())
          .sort((left, right) => right.confidence - left.confidence || right.sourceScore - left.sourceScore)
          .slice(0, 8)
      );

      logRecognition("vector_search_merged", input.traceId, {
        mergedMatches: matches.length,
        bestMatch: matches[0]?.slug || null,
        bestConfidence: matches[0]?.confidence || null,
        diagnostics: vector.diagnostics,
      });
    } catch (vectorError) {
      logRecognition("vector_search_error", input.traceId, {
        error: vectorError instanceof Error ? vectorError.message : String(vectorError),
      });
    }
  } else {
    logRecognition("vector_search_skipped_no_input_embedding", input.traceId);
  }

  const bestMatch = matches[0] || null;
  const secondMatch = matches[1] || null;
  const shouldAutoRedirect = Boolean(
    bestMatch &&
      bestMatch.confidence >= 0.86 &&
      (!secondMatch || bestMatch.confidence - secondMatch.confidence >= 0.16)
  );
  const lowConfidence = !bestMatch;

  logRecognition("service_completed", input.traceId, {
    matches: matches.length,
    bestMatch: bestMatch?.slug || null,
    bestConfidence: bestMatch?.confidence || null,
    lowConfidence: vision.lowConfidence || !bestMatch || bestMatch.confidence < 0.45,
    shouldAutoRedirect,
    durationMs: Date.now() - startedAt,
  });

  return {
    provider: vision.provider,
    summary: vision.summary,
    lowConfidence,
    candidates,
    matches,
    bestMatch,
    shouldAutoRedirect,
    analyzedAt: new Date().toISOString(),
  };
}
