import { Pool } from "pg";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/thor/utils/adminAuth";
import { normalizeL2, VISION_EMBEDDING_DIMENSIONS } from "@/thor/signipedia/recognition/vectorMath";
import { resolveRequiredPostgresConnectionString } from "@/thor/utils/postgresConnection";

export const runtime = "nodejs";

type VisionEmbeddingRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  image_url: string | null;
  vision_embedding_source: string | null;
  vision_dims: number | null;
};

let pool: Pool | null = null;
let columnsReady = false;

function getPool() {
  if (pool) {
    return pool;
  }

  const connectionString = resolveRequiredPostgresConnectionString({ label: "Signipedia" });
  pool = new Pool({ connectionString });
  return pool;
}

async function ensureVisionColumns() {
  if (columnsReady) {
    return;
  }

  const connection = getPool();
  await connection.query(`
    ALTER TABLE signipedia_symbols
      ADD COLUMN IF NOT EXISTS vision_embedding vector(512),
      ADD COLUMN IF NOT EXISTS vision_embedding_source text
  `);
  columnsReady = true;
}

async function loadVisionEmbeddingRows() {
  await ensureVisionColumns();

  const connection = getPool();
  const result = await connection.query<VisionEmbeddingRow>(`
    SELECT
      s.id,
      s.slug,
      s.name,
      s.status,
      first_image.url AS image_url,
      s.vision_embedding_source,
      CASE WHEN s.vision_embedding IS NULL THEN NULL ELSE vector_dims(s.vision_embedding) END AS vision_dims
    FROM signipedia_symbols s
    LEFT JOIN LATERAL (
      SELECT m.url
      FROM signipedia_media m
      WHERE m.symbol_id = s.id AND m.kind = 'image'
      ORDER BY m.sort_order ASC, m.created_at ASC
      LIMIT 1
    ) first_image ON TRUE
    ORDER BY s.slug ASC
  `);

  return result.rows;
}

function toQueueItem(row: VisionEmbeddingRow) {
  if (!row.image_url) {
    return {
      symbolId: row.id,
      slug: row.slug,
      name: row.name,
      imageUrl: null,
      status: "missing-image" as const,
      reason: "No tiene imagen asociada",
      currentDimensions: row.vision_dims,
      currentSource: row.vision_embedding_source,
      needsBackfill: false,
    };
  }

  if (row.vision_dims !== VISION_EMBEDDING_DIMENSIONS) {
    return {
      symbolId: row.id,
      slug: row.slug,
      name: row.name,
      imageUrl: row.image_url,
      status: "pending" as const,
      reason: row.vision_dims === null ? "No existe vision_embedding" : `Dimensión inválida (${row.vision_dims || 0})`,
      currentDimensions: row.vision_dims,
      currentSource: row.vision_embedding_source,
      needsBackfill: true,
    };
  }

  if ((row.vision_embedding_source || "") !== row.image_url) {
    return {
      symbolId: row.id,
      slug: row.slug,
      name: row.name,
      imageUrl: row.image_url,
      status: "pending" as const,
      reason: "La imagen cambió desde el último embedding",
      currentDimensions: row.vision_dims,
      currentSource: row.vision_embedding_source,
      needsBackfill: true,
    };
  }

  return {
    symbolId: row.id,
    slug: row.slug,
    name: row.name,
    imageUrl: row.image_url,
    status: "up-to-date" as const,
    reason: "Embedding vigente",
    currentDimensions: row.vision_dims,
    currentSource: row.vision_embedding_source,
    needsBackfill: false,
  };
}

function formatVectorForPg(values: number[]) {
  return `[${values.map((value) => Number(value.toFixed(8))).join(",")}]`;
}

function parseEmbedding(input: unknown) {
  if (!Array.isArray(input)) {
    return { ok: false as const, reason: "embedding must be an array" };
  }

  const values = input.map((item) => Number(item));
  if (values.some((item) => !Number.isFinite(item))) {
    return { ok: false as const, reason: "embedding contains non-finite values" };
  }

  if (values.length !== VISION_EMBEDDING_DIMENSIONS) {
    return {
      ok: false as const,
      reason: `embedding must have ${VISION_EMBEDDING_DIMENSIONS} dimensions (received ${values.length})`,
    };
  }

  const normalized = normalizeL2(values);
  if (!normalized) {
    return { ok: false as const, reason: "embedding cannot be normalized" };
  }

  return { ok: true as const, normalized };
}

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) {
    return denied;
  }

  const rows = await loadVisionEmbeddingRows();
  const queue = rows.map(toQueueItem);

  const pending = queue.filter((item) => item.needsBackfill);
  const valid512 = queue.filter((item) => item.currentDimensions === VISION_EMBEDDING_DIMENSIONS).length;
  const withImage = queue.filter((item) => Boolean(item.imageUrl)).length;
  const missingImage = queue.length - withImage;

  return NextResponse.json({
    totals: {
      symbolsTotal: queue.length,
      withImage,
      missingImage,
      valid512,
      pending: pending.length,
    },
    queue,
    pending,
  });
}

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) {
    return denied;
  }

  const body = (await request.json()) as {
    symbolId?: unknown;
    imageUrl?: unknown;
    embedding?: unknown;
    force?: unknown;
  };

  const symbolId = String(body.symbolId || "").trim();
  const imageUrl = String(body.imageUrl || "").trim();
  const force = Boolean(body.force);

  if (!symbolId) {
    return NextResponse.json({ error: "symbolId is required" }, { status: 400 });
  }

  if (!imageUrl) {
    return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });
  }

  const parsed = parseEmbedding(body.embedding);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.reason }, { status: 400 });
  }

  await ensureVisionColumns();
  const connection = getPool();

  const current = await connection.query<{
    slug: string;
    vision_embedding_source: string | null;
    vision_dims: number | null;
  }>(
    `
    SELECT
      slug,
      vision_embedding_source,
      CASE WHEN vision_embedding IS NULL THEN NULL ELSE vector_dims(vision_embedding) END AS vision_dims
    FROM signipedia_symbols
    WHERE id = $1
    LIMIT 1
    `,
    [symbolId]
  );

  const row = current.rows[0];
  if (!row) {
    return NextResponse.json({ error: "Symbol not found" }, { status: 404 });
  }

  const shouldSkip =
    !force &&
    row.vision_dims === VISION_EMBEDDING_DIMENSIONS &&
    (row.vision_embedding_source || "") === imageUrl;

  if (shouldSkip) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "up-to-date",
      slug: row.slug,
    });
  }

  const vectorLiteral = formatVectorForPg(parsed.normalized);

  await connection.query(
    `
    UPDATE signipedia_symbols
    SET
      vision_embedding = $1::vector,
      vision_embedding_source = $2,
      updated_at = NOW()
    WHERE id = $3
    `,
    [vectorLiteral, imageUrl, symbolId]
  );

  return NextResponse.json({
    ok: true,
    skipped: false,
    slug: row.slug,
    dimensions: VISION_EMBEDDING_DIMENSIONS,
    source: imageUrl,
  });
}
