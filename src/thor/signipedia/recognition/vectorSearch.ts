import type { HybridMatch } from "@/thor/signipedia/recognition/types";
import { clamp01, cosineSimilarityNormalized, normalizeL2, VISION_EMBEDDING_DIMENSIONS } from "@/thor/signipedia/recognition/vectorMath";
import { createPostgresPool, resolveRequiredPostgresConnectionString, type PostgresPoolLike } from "@/thor/utils/postgresConnection";

const DEFAULT_SIMILARITY_THRESHOLD = Number(process.env.THOR_RECOGNITION_VECTOR_THRESHOLD || 0.22);

type StoredSymbolVectorRow = {
  slug: string;
  name: string;
  meaning: string;
  canonical_glyph: string;
  category_name: string | null;
  image_url: string | null;
  vision_embedding_text: string | null;
  legacy_embedding_text: string | null;
};

type VectorSearchResult = {
  matches: HybridMatch[];
  diagnostics: {
    comparedSymbols: number;
    acceptedSymbols: number;
    rejectedNoEmbedding: number;
    rejectedInvalidDimensions: number;
    rejectedBelowThreshold: number;
    threshold: number;
    bestMatch: { slug: string; similarity: number } | null;
  };
};

let pool: PostgresPoolLike | null = null;

function getPool() {
  if (pool) {
    return pool;
  }

  const connectionString = resolveRequiredPostgresConnectionString({ label: "Signipedia" });
  pool = createPostgresPool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: false,
  });
  return pool;
}

function logRecognition(stage: string, traceId?: string, details?: Record<string, unknown>) {
  const scope = traceId || "no-trace";
  console.info(`[recognition][${scope}] ${stage}`, details || {});
}

function parsePgVectorText(raw: string | null) {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    return null;
  }

  const body = trimmed.slice(1, -1).trim();
  if (!body) {
    return [] as number[];
  }

  const parsed = body
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));

  return parsed;
}

function resolveStoredEmbedding(row: StoredSymbolVectorRow) {
  const vision = parsePgVectorText(row.vision_embedding_text);
  if (vision && vision.length === VISION_EMBEDDING_DIMENSIONS) {
    return vision;
  }

  const legacy = parsePgVectorText(row.legacy_embedding_text);
  if (legacy && legacy.length === VISION_EMBEDDING_DIMENSIONS) {
    return legacy;
  }

  return null;
}

export async function searchSymbolsByImageEmbedding(input: {
  imageEmbedding: number[];
  traceId?: string;
  limit?: number;
  similarityThreshold?: number;
}): Promise<VectorSearchResult> {
  const limit = Math.max(1, Math.min(24, Math.floor(input.limit || 8)));
  const threshold = Number.isFinite(input.similarityThreshold)
    ? Number(input.similarityThreshold)
    : DEFAULT_SIMILARITY_THRESHOLD;

  if (input.imageEmbedding.length !== VISION_EMBEDDING_DIMENSIONS) {
    throw new Error(`Image embedding must have ${VISION_EMBEDDING_DIMENSIONS} dimensions, received ${input.imageEmbedding.length}.`);
  }

  const normalizedQuery = normalizeL2(input.imageEmbedding);
  if (!normalizedQuery) {
    throw new Error("Image embedding cannot be normalized (zero norm).");
  }

  const connection = getPool();
  const rows = await connection.query<StoredSymbolVectorRow>(
    `
    SELECT
      s.slug,
      s.name,
      s.meaning,
      s.canonical_glyph,
      c.name AS category_name,
      first_image.url AS image_url,
      CASE WHEN s.vision_embedding IS NULL THEN NULL ELSE s.vision_embedding::text END AS vision_embedding_text,
      CASE WHEN s.embedding IS NULL THEN NULL ELSE s.embedding::text END AS legacy_embedding_text
    FROM signipedia_symbols s
    JOIN signipedia_categories c ON c.id = s.category_id
    LEFT JOIN LATERAL (
      SELECT m.url
      FROM signipedia_media m
      WHERE m.symbol_id = s.id AND m.kind = 'image'
      ORDER BY m.sort_order ASC, m.created_at ASC
      LIMIT 1
    ) first_image ON TRUE
    WHERE s.status = 'published'
    `
  );

  logRecognition("vector_db_symbols_loaded", input.traceId, {
    symbolsInScope: rows.rows.length,
  });

  const candidates: Array<{ row: StoredSymbolVectorRow; similarity: number }> = [];
  let rejectedNoEmbedding = 0;
  let rejectedInvalidDimensions = 0;
  let rejectedBelowThreshold = 0;

  for (const row of rows.rows) {
    const embedding = resolveStoredEmbedding(row);
    if (!embedding) {
      rejectedNoEmbedding += 1;
      continue;
    }

    if (embedding.length !== VISION_EMBEDDING_DIMENSIONS) {
      rejectedInvalidDimensions += 1;
      continue;
    }

    const normalizedSymbol = normalizeL2(embedding);
    if (!normalizedSymbol) {
      rejectedInvalidDimensions += 1;
      continue;
    }

    const similarity = cosineSimilarityNormalized(normalizedQuery, normalizedSymbol);
    if (!Number.isFinite(similarity) || similarity < threshold) {
      rejectedBelowThreshold += 1;
      continue;
    }

    candidates.push({ row, similarity });
  }

  candidates.sort((left, right) => right.similarity - left.similarity);

  const matches: HybridMatch[] = candidates.slice(0, limit).map((item) => ({
    slug: item.row.slug,
    name: item.row.name,
    glyph: item.row.canonical_glyph || "∎",
    confidence: clamp01(item.similarity),
    meaning: item.row.meaning,
    imageUrl: item.row.image_url,
    categoryName: item.row.category_name,
    reason: `Coincidencia vectorial CLIP (coseno ${item.similarity.toFixed(4)})`,
    sourceScore: item.similarity,
  }));

  const best = matches[0] || null;

  logRecognition("vector_search_completed", input.traceId, {
    comparedSymbols: rows.rows.length,
    acceptedSymbols: matches.length,
    rejectedNoEmbedding,
    rejectedInvalidDimensions,
    rejectedBelowThreshold,
    threshold,
    bestMatch: best ? { slug: best.slug, similarity: Number(best.sourceScore.toFixed(6)) } : null,
    topMatches: matches.slice(0, 5).map((match) => ({
      slug: match.slug,
      similarity: Number(match.sourceScore.toFixed(6)),
    })),
  });

  return {
    matches,
    diagnostics: {
      comparedSymbols: rows.rows.length,
      acceptedSymbols: matches.length,
      rejectedNoEmbedding,
      rejectedInvalidDimensions,
      rejectedBelowThreshold,
      threshold,
      bestMatch: best ? { slug: best.slug, similarity: best.sourceScore } : null,
    },
  };
}
