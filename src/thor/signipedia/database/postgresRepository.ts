import { promises as fs } from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import {
  getRelatedSymbols,
  signipediaCategories,
  signipediaSymbols,
} from "@/lib/signipedia/catalog";
import type {
  CategoryUpsertInput,
  CatalogExport,
  SearchHit,
  SignipediaCategory,
  SignipediaSymbolDetail,
  SignipediaSymbol,
  SymbolSearchQuery,
  SymbolStatus,
  SymbolUpsertInput,
} from "@/thor/signipedia/types";
import type { SignipediaRepository } from "@/thor/signipedia/database/repository";
import { resolveRequiredPostgresConnectionString } from "@/thor/utils/postgresConnection";

let pool: Pool | null = null;
let schemaReadyPromise: Promise<void> | null = null;
let seededPromise: Promise<void> | null = null;

function resolveConnectionString() {
  return resolveRequiredPostgresConnectionString({ label: "Signipedia" });
}

function getPool() {
  if (pool) {
    return pool;
  }

  const connectionString = resolveConnectionString();

  pool = new Pool({ connectionString });
  return pool;
}

function requirePool() {
  const resolved = getPool();
  if (!resolved) {
    throw new Error("Signipedia database is not configured.");
  }
  return resolved;
}

async function loadSchemaSql() {
  const schemaPath = path.resolve(process.cwd(), "src", "thor", "signipedia", "database", "sql", "schema.sql");
  return fs.readFile(schemaPath, "utf8");
}

async function ensureSchemaReady(connection: Pool) {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      const schemaSql = await loadSchemaSql();
      await connection.query(schemaSql);
    })().catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }

  await schemaReadyPromise;
}

async function withClient<T>(task: (client: PoolClient) => Promise<T>) {
  const connection = requirePool();
  await ensureSchemaReady(connection);
  const client = await connection.connect();

  try {
    await client.query("BEGIN");
    const result = await task(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function mapCategoryRow(row: any): SignipediaCategory {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    icon: row.icon,
    parentId: row.parent_id,
    orderIndex: Number(row.order_index || 0),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function parseTextArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [] as string[];
}

function mapSymbolRow(row: any): SignipediaSymbol {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    meaning: row.meaning,
    history: row.history,
    origin: row.origin,
    currentUses: row.current_uses,
    variants: parseTextArray(row.variants),
    curiosities: parseTextArray(row.curiosities),
    synonyms: parseTextArray(row.synonyms),
    categoryId: row.category_id,
    status: row.status,
    isFeatured: Boolean(row.is_featured),
    description: row.description,
    canonicalGlyph: row.canonical_glyph,
    imageUrl: row.image_url || null,
    language: row.language,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapDetailRow(row: any): SignipediaSymbolDetail {
  return {
    symbol: mapSymbolRow(row),
    category: row.category_row_id
      ? {
          id: row.category_row_id,
          slug: row.category_slug,
          name: row.category_name,
          description: row.category_description,
          icon: row.category_icon,
          parentId: row.category_parent_id,
          orderIndex: Number(row.category_order_index || 0),
          createdAt: new Date(row.category_created_at).toISOString(),
          updatedAt: new Date(row.category_updated_at).toISOString(),
        }
      : null,
    aliases: parseTextArray(row.aliases),
    tags: parseTextArray(row.tags),
    synonyms: parseTextArray(row.synonyms),
    relatedSymbols: (row.related_symbols || []).map((item: any) => ({
      id: item.id,
      symbolId: item.symbol_id,
      relatedSymbolId: item.related_symbol_id,
      relationType: item.relation_type,
    })),
    historicalPeriods: (row.historical_periods || []).map((item: any) => ({
      id: item.id,
      symbolId: item.symbol_id,
      label: item.label,
      startYear: item.start_year,
      endYear: item.end_year,
      description: item.description,
    })),
    sources: (row.sources || []).map((item: any) => ({
      id: item.id,
      symbolId: item.symbol_id,
      title: item.title,
      url: item.url,
      author: item.author,
      publishedAt: item.published_at ? new Date(item.published_at).toISOString() : null,
      citation: item.citation,
    })),
    media: (row.media || []).map((item: any) => ({
      id: item.id,
      symbolId: item.symbol_id,
      kind: item.kind,
      url: item.url,
      altText: item.alt_text,
      credit: item.credit,
      width: item.width,
      height: item.height,
      sortOrder: item.sort_order,
    })),
    translations: (row.translations || []).map((item: any) => ({
      id: item.id,
      symbolId: item.symbol_id,
      language: item.language,
      field: item.field,
      value: item.value,
    })),
  };
}

function mapSearchHit(row: any): SearchHit {
  return {
    score: Number(row.score || 0),
    symbol: mapSymbolRow(row),
    category: row.category_id
      ? {
          id: row.category_row_id,
          slug: row.category_slug,
          name: row.category_name,
          description: row.category_description,
          icon: row.category_icon,
          parentId: row.category_parent_id,
          orderIndex: Number(row.category_order_index || 0),
          createdAt: new Date(row.category_created_at).toISOString(),
          updatedAt: new Date(row.category_updated_at).toISOString(),
        }
      : null,
    aliases: row.aliases || [],
    tags: row.tags || [],
  };
}

function sanitizeLimit(value: number | undefined) {
  return Math.max(1, Math.min(200, Math.floor(value || 50)));
}

function sanitizeOffset(value: number | undefined) {
  return Math.max(0, Math.floor(value || 0));
}

async function seedFromCatalog() {
  const connection = requirePool();
  await ensureSchemaReady(connection);

  if (seededPromise) {
    return seededPromise;
  }

  seededPromise = withClient(async (client) => {
    const countResult = await client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM signipedia_symbols");
    if (Number(countResult.rows[0]?.count || 0) > 0) {
      return;
    }

    const categoryIdMap = new Map<string, string>();
    for (const category of signipediaCategories) {
      const result = await client.query<{ id: string }>(
        `
        INSERT INTO signipedia_categories (slug, name, description, order_index)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (slug) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          order_index = EXCLUDED.order_index,
          updated_at = NOW()
        RETURNING id
        `,
        [category.id, category.label, category.description, 0]
      );
      categoryIdMap.set(category.id, result.rows[0].id);
    }

    const symbolIdMap = new Map<string, string>();
    for (const symbol of signipediaSymbols) {
      const result = await client.query<{ id: string }>(
        `
        INSERT INTO signipedia_symbols
          (slug, name, meaning, history, origin, current_uses, description, canonical_glyph, variants, curiosities, language, category_id, status, is_featured)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, 'es', $11, 'published', $12)
        ON CONFLICT (slug) DO UPDATE SET
          name = EXCLUDED.name,
          meaning = EXCLUDED.meaning,
          history = EXCLUDED.history,
          origin = EXCLUDED.origin,
          current_uses = EXCLUDED.current_uses,
          description = EXCLUDED.description,
          canonical_glyph = EXCLUDED.canonical_glyph,
          variants = EXCLUDED.variants,
          curiosities = EXCLUDED.curiosities,
          category_id = EXCLUDED.category_id,
          status = EXCLUDED.status,
          is_featured = EXCLUDED.is_featured,
          updated_at = NOW()
        RETURNING id
        `,
        [
          symbol.slug,
          symbol.name,
          symbol.meaning,
          symbol.history,
          symbol.origin,
          symbol.currentUses,
          symbol.meaning,
          symbol.glyph,
          JSON.stringify(symbol.variants || []),
          JSON.stringify(symbol.curiosities || []),
          categoryIdMap.get(symbol.categoryId),
          Boolean(symbol.featured),
        ]
      );
      symbolIdMap.set(symbol.slug, result.rows[0].id);
    }

    for (const symbol of signipediaSymbols) {
      const symbolId = symbolIdMap.get(symbol.slug);
      if (!symbolId) continue;

      await client.query(`DELETE FROM signipedia_symbol_aliases WHERE symbol_id = $1`, [symbolId]);
      await client.query(`DELETE FROM signipedia_symbol_tags WHERE symbol_id = $1`, [symbolId]);
      await client.query(`DELETE FROM signipedia_related_symbols WHERE symbol_id = $1`, [symbolId]);
      await client.query(`DELETE FROM signipedia_historical_periods WHERE symbol_id = $1`, [symbolId]);
      await client.query(`DELETE FROM signipedia_sources WHERE symbol_id = $1`, [symbolId]);
      await client.query(`DELETE FROM signipedia_media WHERE symbol_id = $1`, [symbolId]);
      await client.query(`DELETE FROM signipedia_translations WHERE symbol_id = $1`, [symbolId]);

      for (const alias of symbol.aliases) {
        await client.query(
          `INSERT INTO signipedia_symbol_aliases (symbol_id, alias, language) VALUES ($1, $2, 'es') ON CONFLICT DO NOTHING`,
          [symbolId, alias]
        );
      }

      for (const tag of symbol.keywords) {
        await client.query(
          `INSERT INTO signipedia_symbol_tags (symbol_id, tag, language) VALUES ($1, $2, 'es') ON CONFLICT DO NOTHING`,
          [symbolId, tag]
        );
      }

      for (const synonym of symbol.synonyms || symbol.aliases) {
        await client.query(
          `INSERT INTO signipedia_symbol_synonyms (symbol_id, synonym, language) VALUES ($1, $2, 'es') ON CONFLICT DO NOTHING`,
          [symbolId, synonym]
        );
      }

      for (const related of getRelatedSymbols(symbol)) {
        const relatedId = symbolIdMap.get(related.slug);
        if (!relatedId) continue;
        await client.query(
          `
          INSERT INTO signipedia_related_symbols (symbol_id, related_symbol_id, relation_type)
          VALUES ($1, $2, 'related')
          ON CONFLICT DO NOTHING
          `,
          [symbolId, relatedId]
        );
      }
    }
  });

  await seededPromise;
}

type Queryable = Pick<PoolClient, "query">;

async function resolveCategoryId(connection: Queryable, categoryIdOrSlug: string) {
  const result = await connection.query<{ id: string }>(
    `
    SELECT id
    FROM signipedia_categories
    WHERE slug = $1
      OR id = CASE
        WHEN $1 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN $1::uuid
        ELSE NULL
      END
    LIMIT 1
    `,
    [categoryIdOrSlug]
  );

  return result.rows[0]?.id || null;
}

async function resolveSymbolId(connection: Queryable, symbolIdOrSlug: string) {
  const result = await connection.query<{ id: string }>(
    `
    SELECT id
    FROM signipedia_symbols
    WHERE slug = $1
      OR id = CASE
        WHEN $1 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN $1::uuid
        ELSE NULL
      END
    LIMIT 1
    `,
    [symbolIdOrSlug]
  );

  return result.rows[0]?.id || null;
}

async function fetchSymbolBySlug(client: Queryable, slug: string) {
  const result = await client.query(
    `
    SELECT s.*, first_image.url AS image_url, c.id AS category_row_id, c.slug AS category_slug, c.name AS category_name, c.description AS category_description, c.icon AS category_icon, c.parent_id AS category_parent_id, c.order_index AS category_order_index, c.created_at AS category_created_at, c.updated_at AS category_updated_at,
      COALESCE(array_agg(DISTINCT a.alias) FILTER (WHERE a.alias IS NOT NULL), ARRAY[]::text[]) AS aliases,
      COALESCE(array_agg(DISTINCT syn.synonym) FILTER (WHERE syn.synonym IS NOT NULL), ARRAY[]::text[]) AS synonyms,
      COALESCE(array_agg(DISTINCT t.tag) FILTER (WHERE t.tag IS NOT NULL), ARRAY[]::text[]) AS tags
    FROM signipedia_symbols s
    JOIN signipedia_categories c ON c.id = s.category_id
    LEFT JOIN signipedia_symbol_aliases a ON a.symbol_id = s.id
    LEFT JOIN signipedia_symbol_synonyms syn ON syn.symbol_id = s.id
    LEFT JOIN signipedia_symbol_tags t ON t.symbol_id = s.id
    LEFT JOIN LATERAL (
      SELECT m.url
      FROM signipedia_media m
      WHERE m.symbol_id = s.id AND m.kind = 'image'
      ORDER BY m.sort_order ASC, m.created_at ASC
      LIMIT 1
    ) first_image ON TRUE
    WHERE s.slug = $1
    GROUP BY s.id, c.id, first_image.url
    `,
    [slug]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    symbol: mapSymbolRow(row),
    category: mapCategoryRow(row),
    aliases: row.aliases || [],
    tags: row.tags || [],
  };
}

export const postgresSignipediaRepository: SignipediaRepository = {
  isConfigured() {
    return Boolean(process.env.DATABASE_URL?.trim());
  },

  async bootstrap() {
    const connection = requirePool();
    await ensureSchemaReady(connection);
    await seedFromCatalog();
  },

  async getStats() {
    await this.bootstrap();
    const connection = requirePool();
    const result = await connection.query<{
      symbol_count: string;
      category_count: string;
      featured_count: string;
      alias_count: string;
      tag_count: string;
      synonym_count: string;
      image_count: string;
      vision_embedding_count: string;
    }>(
      `
      SELECT
        (SELECT COUNT(*)::text FROM signipedia_symbols) AS symbol_count,
        (SELECT COUNT(*)::text FROM signipedia_categories) AS category_count,
        (SELECT COUNT(*)::text FROM signipedia_symbols WHERE is_featured = true) AS featured_count,
        (SELECT COUNT(*)::text FROM signipedia_symbol_aliases) AS alias_count,
        (SELECT COUNT(*)::text FROM signipedia_symbol_tags) AS tag_count,
        (SELECT COUNT(*)::text FROM signipedia_symbol_synonyms) AS synonym_count,
        (SELECT COUNT(*)::text FROM signipedia_media WHERE kind = 'image') AS image_count,
        (SELECT COUNT(*)::text FROM signipedia_symbols WHERE vision_embedding IS NOT NULL AND vector_dims(vision_embedding) = 512) AS vision_embedding_count
      `
    );

    const row = result.rows[0] || {};
    return {
      symbolCount: Number(row.symbol_count || 0),
      categoryCount: Number(row.category_count || 0),
      featuredCount: Number(row.featured_count || 0),
      aliasCount: Number(row.alias_count || 0),
      tagCount: Number(row.tag_count || 0),
      synonymCount: Number(row.synonym_count || 0),
      imageCount: Number(row.image_count || 0),
      visionEmbeddingCount: Number(row.vision_embedding_count || 0),
    };
  },

  async listCategories() {
    await this.bootstrap();
    const connection = requirePool();
    const result = await connection.query(`SELECT * FROM signipedia_categories ORDER BY order_index ASC, name ASC`);
    return result.rows.map(mapCategoryRow);
  },

  async getCategoryBySlug(slug: string) {
    await this.bootstrap();
    const connection = requirePool();
    const result = await connection.query(`SELECT * FROM signipedia_categories WHERE slug = $1`, [slug]);
    return result.rows[0] ? mapCategoryRow(result.rows[0]) : null;
  },

  async upsertCategory(input: CategoryUpsertInput) {
    await this.bootstrap();
    const connection = requirePool();
    const parentId = input.parentId ? await resolveCategoryId(connection, input.parentId) : null;
    const result = await connection.query(
      `
      INSERT INTO signipedia_categories (slug, name, description, icon, parent_id, order_index)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        icon = EXCLUDED.icon,
        parent_id = EXCLUDED.parent_id,
        order_index = EXCLUDED.order_index,
        updated_at = NOW()
      RETURNING *
      `,
      [input.slug, input.name, input.description, input.icon || null, parentId, input.orderIndex || 0]
    );
    return mapCategoryRow(result.rows[0]);
  },

  async deleteCategory(categoryId: string) {
    await this.bootstrap();
    const connection = requirePool();
    await connection.query(`DELETE FROM signipedia_categories WHERE id = $1`, [categoryId]);
  },

  async listSymbols(query?: SymbolSearchQuery) {
    await this.bootstrap();
    const connection = requirePool();
    const limit = sanitizeLimit(query?.limit);
    const offset = sanitizeOffset(query?.offset);
    const search = query?.query?.trim() || null;
    const categorySlug = query?.categorySlug?.trim() || null;
    const tag = query?.tag?.trim() || null;
    const language = query?.language?.trim() || null;

    const result = await connection.query(
      `
      WITH alias_agg AS (
        SELECT symbol_id, array_agg(alias ORDER BY alias) AS aliases
        FROM signipedia_symbol_aliases
        GROUP BY symbol_id
      ),
      synonym_agg AS (
        SELECT symbol_id, array_agg(synonym ORDER BY synonym) AS synonyms
        FROM signipedia_symbol_synonyms
        GROUP BY symbol_id
      ),
      tag_agg AS (
        SELECT symbol_id, array_agg(tag ORDER BY tag) AS tags
        FROM signipedia_symbol_tags
        GROUP BY symbol_id
      )
      SELECT
        s.*,
        first_image.url AS image_url,
        c.id AS category_row_id,
        c.slug AS category_slug,
        c.name AS category_name,
        c.description AS category_description,
        c.icon AS category_icon,
        c.parent_id AS category_parent_id,
        c.order_index AS category_order_index,
        c.created_at AS category_created_at,
        c.updated_at AS category_updated_at,
        COALESCE(a.aliases, ARRAY[]::text[]) AS aliases,
        COALESCE(syn.synonyms, ARRAY[]::text[]) AS synonyms,
        COALESCE(t.tags, ARRAY[]::text[]) AS tags,
        (
          CASE WHEN $1::text IS NULL THEN 0 ELSE ts_rank_cd(s.search_document, websearch_to_tsquery('simple', public.unaccent($1::text))) END +
          CASE WHEN $1::text IS NULL THEN 0 ELSE similarity(public.unaccent(s.name), public.unaccent($1::text)) END +
          CASE WHEN $1::text IS NULL THEN 0 ELSE similarity(public.unaccent(s.description), public.unaccent($1::text)) END +
          CASE WHEN $1::text IS NULL THEN 0 ELSE similarity(public.unaccent(s.meaning), public.unaccent($1::text)) END +
          CASE WHEN $1::text IS NULL THEN 0 ELSE similarity(public.unaccent(c.name), public.unaccent($1::text)) END +
          CASE WHEN $1::text IS NULL THEN 0 ELSE COALESCE((SELECT MAX(similarity(public.unaccent(alias), public.unaccent($1::text))) FROM signipedia_symbol_aliases sa WHERE sa.symbol_id = s.id), 0) END +
          CASE WHEN $1::text IS NULL THEN 0 ELSE COALESCE((SELECT MAX(similarity(public.unaccent(synonym), public.unaccent($1::text))) FROM signipedia_symbol_synonyms ss WHERE ss.symbol_id = s.id), 0) END +
          CASE WHEN $1::text IS NULL THEN 0 ELSE COALESCE((SELECT MAX(similarity(public.unaccent(tag), public.unaccent($1::text))) FROM signipedia_symbol_tags st WHERE st.symbol_id = s.id), 0) END
        ) AS score
      FROM signipedia_symbols s
      JOIN signipedia_categories c ON c.id = s.category_id
      LEFT JOIN alias_agg a ON a.symbol_id = s.id
      LEFT JOIN synonym_agg syn ON syn.symbol_id = s.id
      LEFT JOIN tag_agg t ON t.symbol_id = s.id
      LEFT JOIN LATERAL (
        SELECT m.url
        FROM signipedia_media m
        WHERE m.symbol_id = s.id AND m.kind = 'image'
        ORDER BY m.sort_order ASC, m.created_at ASC
        LIMIT 1
      ) first_image ON TRUE
      WHERE ($2::text IS NULL OR c.slug = $2::text)
        AND ($3::text IS NULL OR EXISTS (SELECT 1 FROM signipedia_symbol_tags st WHERE st.symbol_id = s.id AND lower(st.tag) = lower($3::text)))
        AND ($4::text IS NULL OR s.language = $4::text)
        AND (
          $1::text IS NULL OR
          s.name ILIKE '%' || $1::text || '%' OR
          s.description ILIKE '%' || $1::text || '%' OR
          s.meaning ILIKE '%' || $1::text || '%' OR
          s.history ILIKE '%' || $1::text || '%' OR
          s.origin ILIKE '%' || $1::text || '%' OR
          c.name ILIKE '%' || $1::text || '%' OR
          EXISTS (SELECT 1 FROM signipedia_symbol_aliases sa WHERE sa.symbol_id = s.id AND sa.alias ILIKE '%' || $1::text || '%') OR
          EXISTS (SELECT 1 FROM signipedia_symbol_synonyms ss WHERE ss.symbol_id = s.id AND ss.synonym ILIKE '%' || $1::text || '%') OR
          EXISTS (SELECT 1 FROM signipedia_symbol_tags st WHERE st.symbol_id = s.id AND st.tag ILIKE '%' || $1::text || '%')
        )
      ORDER BY score DESC, s.is_featured DESC, s.name ASC
      LIMIT $5 OFFSET $6
      `,
      [search, categorySlug, tag, language, limit, offset]
    );

    return result.rows.map(mapSearchHit);
  },

  async countSymbols(query?: SymbolSearchQuery) {
    await this.bootstrap();
    const connection = requirePool();
    const search = query?.query?.trim() || null;
    const categorySlug = query?.categorySlug?.trim() || null;
    const tag = query?.tag?.trim() || null;
    const language = query?.language?.trim() || null;

    const result = await connection.query<{ count: string }>(
      `
      SELECT COUNT(*)::text AS count
      FROM signipedia_symbols s
      JOIN signipedia_categories c ON c.id = s.category_id
      WHERE ($2::text IS NULL OR c.slug = $2::text)
        AND ($3::text IS NULL OR EXISTS (SELECT 1 FROM signipedia_symbol_tags st WHERE st.symbol_id = s.id AND lower(st.tag) = lower($3::text)))
        AND ($4::text IS NULL OR s.language = $4::text)
        AND (
          $1::text IS NULL OR
          s.name ILIKE '%' || $1::text || '%' OR
          s.description ILIKE '%' || $1::text || '%' OR
          s.meaning ILIKE '%' || $1::text || '%' OR
          s.history ILIKE '%' || $1::text || '%' OR
          s.origin ILIKE '%' || $1::text || '%' OR
          c.name ILIKE '%' || $1::text || '%' OR
          EXISTS (SELECT 1 FROM signipedia_symbol_aliases sa WHERE sa.symbol_id = s.id AND sa.alias ILIKE '%' || $1::text || '%') OR
          EXISTS (SELECT 1 FROM signipedia_symbol_synonyms ss WHERE ss.symbol_id = s.id AND ss.synonym ILIKE '%' || $1::text || '%') OR
          EXISTS (SELECT 1 FROM signipedia_symbol_tags st WHERE st.symbol_id = s.id AND st.tag ILIKE '%' || $1::text || '%')
        )
      `,
      [search, categorySlug, tag, language]
    );

    return Number(result.rows[0]?.count || 0);
  },

  async getSymbolBySlug(slug: string) {
    await this.bootstrap();
    const connection = requirePool();
    const row = await fetchSymbolBySlug(connection, slug);
    return row ? row.symbol : null;
  },

  async getSymbolById(symbolId: string) {
    await this.bootstrap();
    const connection = requirePool();
    const result = await connection.query(`SELECT * FROM signipedia_symbols WHERE id = $1`, [symbolId]);
    return result.rows[0] ? mapSymbolRow(result.rows[0]) : null;
  },

  async getSymbolDetailBySlug(slug: string) {
    await this.bootstrap();
    const connection = requirePool();
    const result = await connection.query(
      `
      SELECT
        s.*,
        first_image.url AS image_url,
        c.id AS category_row_id,
        c.slug AS category_slug,
        c.name AS category_name,
        c.description AS category_description,
        c.icon AS category_icon,
        c.parent_id AS category_parent_id,
        c.order_index AS category_order_index,
        c.created_at AS category_created_at,
        c.updated_at AS category_updated_at,
        COALESCE(a.aliases, ARRAY[]::text[]) AS aliases,
        COALESCE(syn.synonyms, ARRAY[]::text[]) AS synonyms,
        COALESCE(t.tags, ARRAY[]::text[]) AS tags,
        COALESCE(rel.related_symbols, '[]'::json) AS related_symbols,
        COALESCE(hist.historical_periods, '[]'::json) AS historical_periods,
        COALESCE(src.sources, '[]'::json) AS sources,
        COALESCE(med.media, '[]'::json) AS media,
        COALESCE(tr.translations, '[]'::json) AS translations
      FROM signipedia_symbols s
      JOIN signipedia_categories c ON c.id = s.category_id
      LEFT JOIN (
        SELECT symbol_id, array_agg(alias ORDER BY alias) AS aliases
        FROM signipedia_symbol_aliases
        GROUP BY symbol_id
      ) a ON a.symbol_id = s.id
      LEFT JOIN (
        SELECT symbol_id, array_agg(synonym ORDER BY synonym) AS synonyms
        FROM signipedia_symbol_synonyms
        GROUP BY symbol_id
      ) syn ON syn.symbol_id = s.id
      LEFT JOIN (
        SELECT symbol_id, array_agg(tag ORDER BY tag) AS tags
        FROM signipedia_symbol_tags
        GROUP BY symbol_id
      ) t ON t.symbol_id = s.id
      LEFT JOIN LATERAL (
        SELECT m.url
        FROM signipedia_media m
        WHERE m.symbol_id = s.id AND m.kind = 'image'
        ORDER BY m.sort_order ASC, m.created_at ASC
        LIMIT 1
      ) first_image ON TRUE
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('id', rs.id, 'symbol_id', rs.symbol_id, 'related_symbol_id', rs.related_symbol_id, 'relation_type', rs.relation_type)) AS related_symbols
        FROM signipedia_related_symbols rs
        WHERE rs.symbol_id = s.id
      ) rel ON TRUE
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('id', hp.id, 'symbol_id', hp.symbol_id, 'label', hp.label, 'start_year', hp.start_year, 'end_year', hp.end_year, 'description', hp.description)) AS historical_periods
        FROM signipedia_historical_periods hp
        WHERE hp.symbol_id = s.id
      ) hist ON TRUE
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('id', so.id, 'symbol_id', so.symbol_id, 'title', so.title, 'url', so.url, 'author', so.author, 'published_at', so.published_at, 'citation', so.citation)) AS sources
        FROM signipedia_sources so
        WHERE so.symbol_id = s.id
      ) src ON TRUE
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('id', m.id, 'symbol_id', m.symbol_id, 'kind', m.kind, 'url', m.url, 'alt_text', m.alt_text, 'credit', m.credit, 'width', m.width, 'height', m.height, 'sort_order', m.sort_order)) AS media
        FROM signipedia_media m
        WHERE m.symbol_id = s.id
      ) med ON TRUE
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('id', tr.id, 'symbol_id', tr.symbol_id, 'language', tr.language, 'field', tr.field, 'value', tr.value)) AS translations
        FROM signipedia_translations tr
        WHERE tr.symbol_id = s.id
      ) tr ON TRUE
      WHERE s.slug = $1
      `,
      [slug]
    );

    return result.rows[0] ? mapDetailRow(result.rows[0]) : null;
  },

  async getSymbolDetailById(symbolId: string) {
    await this.bootstrap();
    const connection = requirePool();
    const lookup = await connection.query<{ slug: string }>(`SELECT slug FROM signipedia_symbols WHERE id = $1 LIMIT 1`, [symbolId]);
    const slug = lookup.rows[0]?.slug;
    if (!slug) {
      return null;
    }
    return this.getSymbolDetailBySlug(slug);
  },

  async createSymbol(input: SymbolUpsertInput) {
    await this.bootstrap();
    const connection = requirePool();
    const categoryId = await resolveCategoryId(connection, input.categoryId);
    if (!categoryId) {
      throw new Error(`Category not found: ${input.categoryId}`);
    }
    const result = await connection.query(
      `
      INSERT INTO signipedia_symbols
        (slug, name, meaning, history, origin, current_uses, description, canonical_glyph, variants, curiosities, language, category_id, status, is_featured)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13, $14)
      RETURNING *
      `,
      [
        input.slug,
        input.name,
        input.meaning,
        input.history,
        input.origin,
        input.currentUses,
        input.description || input.meaning,
        input.canonicalGlyph || "",
        JSON.stringify(input.variants || []),
        JSON.stringify(input.curiosities || []),
        input.language || "es",
        categoryId,
        input.status || "draft",
        Boolean(input.isFeatured),
      ]
    );

    return mapSymbolRow(result.rows[0]);
  },

  async updateSymbol(symbolId: string, input: Partial<SymbolUpsertInput>) {
    await this.bootstrap();
    const connection = requirePool();
    const existing = await this.getSymbolById(symbolId);
    if (!existing) {
      return null;
    }

    const requestedCategoryId = input.categoryId
      ? await resolveCategoryId(connection, input.categoryId)
      : existing.categoryId;
    if (!requestedCategoryId) {
      throw new Error(`Category not found: ${input.categoryId}`);
    }

    const result = await connection.query(
      `
      UPDATE signipedia_symbols
      SET slug = $2,
          name = $3,
          meaning = $4,
          history = $5,
          origin = $6,
          current_uses = $7,
          description = $8,
          canonical_glyph = $9,
            variants = $10::jsonb,
            curiosities = $11::jsonb,
            language = $12,
            category_id = $13,
            status = $14,
            is_featured = $15,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [
        symbolId,
        input.slug || existing.slug,
        input.name || existing.name,
        input.meaning || existing.meaning,
        input.history || existing.history,
        input.origin || existing.origin,
        input.currentUses || existing.currentUses,
        input.description || existing.description,
        input.canonicalGlyph || existing.canonicalGlyph,
        JSON.stringify(input.variants ?? existing.variants),
        JSON.stringify(input.curiosities ?? existing.curiosities),
        input.language || existing.language,
        requestedCategoryId,
        input.status || existing.status,
        typeof input.isFeatured === "boolean" ? input.isFeatured : existing.isFeatured,
      ]
    );
    return mapSymbolRow(result.rows[0]);
  },

  async deleteSymbol(symbolId: string) {
    await this.bootstrap();
    const connection = requirePool();
    await connection.query(`DELETE FROM signipedia_symbols WHERE id = $1`, [symbolId]);
  },

  async setAliases(symbolId: string, aliases: string[], language = "es") {
    await this.bootstrap();
    const connection = requirePool();
    await connection.query(`DELETE FROM signipedia_symbol_aliases WHERE symbol_id = $1`, [symbolId]);
    for (const alias of aliases.filter(Boolean)) {
      await connection.query(`INSERT INTO signipedia_symbol_aliases (symbol_id, alias, language) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [symbolId, alias.trim(), language]);
    }
    const result = await connection.query(`SELECT * FROM signipedia_symbol_aliases WHERE symbol_id = $1 ORDER BY alias ASC`, [symbolId]);
    return result.rows.map((row) => ({ id: row.id, symbolId: row.symbol_id, alias: row.alias, language: row.language }));
  },

  async setTags(symbolId: string, tags: string[], language = "es") {
    await this.bootstrap();
    const connection = requirePool();
    await connection.query(`DELETE FROM signipedia_symbol_tags WHERE symbol_id = $1`, [symbolId]);
    for (const tag of tags.filter(Boolean)) {
      await connection.query(`INSERT INTO signipedia_symbol_tags (symbol_id, tag, language) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [symbolId, tag.trim(), language]);
    }
    const result = await connection.query(`SELECT * FROM signipedia_symbol_tags WHERE symbol_id = $1 ORDER BY tag ASC`, [symbolId]);
    return result.rows.map((row) => ({ id: row.id, symbolId: row.symbol_id, tag: row.tag, language: row.language }));
  },

  async setSynonyms(symbolId: string, synonyms: string[], language = "es") {
    await this.bootstrap();
    const connection = requirePool();
    await connection.query(`DELETE FROM signipedia_symbol_synonyms WHERE symbol_id = $1`, [symbolId]);
    for (const synonym of synonyms.filter(Boolean)) {
      await connection.query(
        `INSERT INTO signipedia_symbol_synonyms (symbol_id, synonym, language) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [symbolId, synonym.trim(), language]
      );
    }
    const result = await connection.query(`SELECT * FROM signipedia_symbol_synonyms WHERE symbol_id = $1 ORDER BY synonym ASC`, [symbolId]);
    return result.rows.map((row) => ({ id: row.id, symbolId: row.symbol_id, synonym: row.synonym, language: row.language }));
  },

  async setRelatedSymbols(symbolId: string, related) {
    await this.bootstrap();
    const connection = requirePool();
    await connection.query(`DELETE FROM signipedia_related_symbols WHERE symbol_id = $1`, [symbolId]);
    for (const item of related) {
      const relatedSymbolId = await resolveSymbolId(connection, item.relatedSymbolId);
      if (!relatedSymbolId) {
        continue;
      }
      await connection.query(
        `INSERT INTO signipedia_related_symbols (symbol_id, related_symbol_id, relation_type) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [symbolId, relatedSymbolId, item.relationType || "related"]
      );
    }
    const result = await connection.query(`SELECT * FROM signipedia_related_symbols WHERE symbol_id = $1 ORDER BY created_at ASC`, [symbolId]);
    return result.rows.map((row) => ({ id: row.id, symbolId: row.symbol_id, relatedSymbolId: row.related_symbol_id, relationType: row.relation_type }));
  },

  async setHistoricalPeriods(symbolId: string, periods) {
    await this.bootstrap();
    const connection = requirePool();
    await connection.query(`DELETE FROM signipedia_historical_periods WHERE symbol_id = $1`, [symbolId]);
    for (const period of periods) {
      await connection.query(
        `INSERT INTO signipedia_historical_periods (symbol_id, label, start_year, end_year, description) VALUES ($1, $2, $3, $4, $5)`,
        [symbolId, period.label, period.startYear, period.endYear, period.description]
      );
    }
    const result = await connection.query(`SELECT * FROM signipedia_historical_periods WHERE symbol_id = $1 ORDER BY created_at ASC`, [symbolId]);
    return result.rows.map((row) => ({ id: row.id, symbolId: row.symbol_id, label: row.label, startYear: row.start_year, endYear: row.end_year, description: row.description }));
  },

  async setSources(symbolId: string, sources) {
    await this.bootstrap();
    const connection = requirePool();
    await connection.query(`DELETE FROM signipedia_sources WHERE symbol_id = $1`, [symbolId]);
    for (const source of sources) {
      await connection.query(
        `INSERT INTO signipedia_sources (symbol_id, title, url, author, published_at, citation) VALUES ($1, $2, $3, $4, $5, $6)`,
        [symbolId, source.title, source.url, source.author, source.publishedAt, source.citation]
      );
    }
    const result = await connection.query(`SELECT * FROM signipedia_sources WHERE symbol_id = $1 ORDER BY created_at ASC`, [symbolId]);
    return result.rows.map((row) => ({ id: row.id, symbolId: row.symbol_id, title: row.title, url: row.url, author: row.author, publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null, citation: row.citation }));
  },

  async setMedia(symbolId: string, media) {
    await this.bootstrap();
    const connection = requirePool();
    await connection.query(`DELETE FROM signipedia_media WHERE symbol_id = $1`, [symbolId]);
    for (const item of media) {
      await connection.query(
        `INSERT INTO signipedia_media (symbol_id, kind, url, alt_text, credit, width, height, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [symbolId, item.kind, item.url, item.altText, item.credit, item.width, item.height, item.sortOrder]
      );
    }
    const result = await connection.query(`SELECT * FROM signipedia_media WHERE symbol_id = $1 ORDER BY sort_order ASC`, [symbolId]);
    return result.rows.map((row) => ({ id: row.id, symbolId: row.symbol_id, kind: row.kind, url: row.url, altText: row.alt_text, credit: row.credit, width: row.width, height: row.height, sortOrder: row.sort_order }));
  },

  async setTranslations(symbolId: string, translations) {
    await this.bootstrap();
    const connection = requirePool();
    await connection.query(`DELETE FROM signipedia_translations WHERE symbol_id = $1`, [symbolId]);
    for (const item of translations) {
      await connection.query(
        `INSERT INTO signipedia_translations (symbol_id, language, field, value) VALUES ($1, $2, $3, $4)`,
        [symbolId, item.language, item.field, item.value]
      );
    }
    const result = await connection.query(`SELECT * FROM signipedia_translations WHERE symbol_id = $1 ORDER BY language ASC, field ASC`, [symbolId]);
    return result.rows.map((row) => ({ id: row.id, symbolId: row.symbol_id, language: row.language, field: row.field, value: row.value }));
  },

  async listFavorites(sessionId: string) {
    await this.bootstrap();
    const connection = requirePool();
    const result = await connection.query(`SELECT * FROM signipedia_favorites WHERE session_id = $1 ORDER BY created_at DESC`, [sessionId]);
    return result.rows.map((row) => ({ id: row.id, symbolId: row.symbol_id, sessionId: row.session_id, createdAt: new Date(row.created_at).toISOString() }));
  },

  async toggleFavorite(sessionId: string, symbolId: string) {
    await this.bootstrap();
    const connection = requirePool();
    const existing = await connection.query(`SELECT id FROM signipedia_favorites WHERE session_id = $1 AND symbol_id = $2`, [sessionId, symbolId]);
    if (existing.rows[0]) {
      await connection.query(`DELETE FROM signipedia_favorites WHERE session_id = $1 AND symbol_id = $2`, [sessionId, symbolId]);
      return { favorited: false };
    }
    await connection.query(`INSERT INTO signipedia_favorites (symbol_id, session_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [symbolId, sessionId]);
    return { favorited: true };
  },

  async removeFavorite(sessionId: string, symbolId: string) {
    await this.bootstrap();
    const connection = requirePool();
    await connection.query(`DELETE FROM signipedia_favorites WHERE session_id = $1 AND symbol_id = $2`, [sessionId, symbolId]);
  },

  async importCatalog(catalog: CatalogExport) {
    await this.bootstrap();
    await withClient(async (client) => {
      const categoryIdMap = new Map<string, string>();

      for (const category of catalog.categories) {
        const result = await client.query<{ id: string }>(
          `INSERT INTO signipedia_categories (slug, name, description, icon, parent_id, order_index) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon, parent_id = EXCLUDED.parent_id, order_index = EXCLUDED.order_index, updated_at = NOW() RETURNING id`,
          [category.slug, category.name, category.description, category.icon || null, category.parentId || null, category.orderIndex]
        );
        categoryIdMap.set(category.id, result.rows[0].id);
      }

      const symbolIdMap = new Map<string, string>();
      for (const symbol of catalog.symbols) {
        const categoryId = categoryIdMap.get(symbol.categoryId) || symbol.categoryId;
        const result = await client.query<{ id: string }>(
          `
          INSERT INTO signipedia_symbols (slug, name, meaning, history, origin, current_uses, description, canonical_glyph, language, category_id, status, is_featured)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (slug) DO UPDATE SET
            name = EXCLUDED.name,
            meaning = EXCLUDED.meaning,
            history = EXCLUDED.history,
            origin = EXCLUDED.origin,
            current_uses = EXCLUDED.current_uses,
            description = EXCLUDED.description,
            canonical_glyph = EXCLUDED.canonical_glyph,
            language = EXCLUDED.language,
            category_id = EXCLUDED.category_id,
            status = EXCLUDED.status,
            is_featured = EXCLUDED.is_featured,
            updated_at = NOW()
          RETURNING id
          `,
          [
            symbol.slug,
            symbol.name,
            symbol.meaning,
            symbol.history,
            symbol.origin,
            symbol.currentUses,
            symbol.meaning,
            symbol.glyph,
            "es",
            categoryId,
            "published",
            Boolean(symbol.featured),
          ]
        );
        symbolIdMap.set(symbol.slug, result.rows[0].id);
      }

      for (const symbol of catalog.symbols) {
        const symbolId = symbolIdMap.get(symbol.slug);
        if (!symbolId) continue;

        await client.query(`DELETE FROM signipedia_symbol_aliases WHERE symbol_id = $1`, [symbolId]);
        await client.query(`DELETE FROM signipedia_symbol_tags WHERE symbol_id = $1`, [symbolId]);
        await client.query(`DELETE FROM signipedia_symbol_synonyms WHERE symbol_id = $1`, [symbolId]);
        await client.query(`DELETE FROM signipedia_related_symbols WHERE symbol_id = $1`, [symbolId]);
        await client.query(`DELETE FROM signipedia_historical_periods WHERE symbol_id = $1`, [symbolId]);

        for (const alias of symbol.aliases) {
          await client.query(`INSERT INTO signipedia_symbol_aliases (symbol_id, alias, language) VALUES ($1, $2, 'es') ON CONFLICT DO NOTHING`, [symbolId, alias]);
        }

        for (const tag of symbol.keywords) {
          await client.query(`INSERT INTO signipedia_symbol_tags (symbol_id, tag, language) VALUES ($1, $2, 'es') ON CONFLICT DO NOTHING`, [symbolId, tag]);
        }

        for (const synonym of symbol.synonyms || symbol.aliases) {
          await client.query(`INSERT INTO signipedia_symbol_synonyms (symbol_id, synonym, language) VALUES ($1, $2, 'es') ON CONFLICT DO NOTHING`, [symbolId, synonym]);
        }

        for (const related of getRelatedSymbols(symbol as any)) {
          const relatedSymbolId = symbolIdMap.get(related.slug);
          if (!relatedSymbolId) continue;

          await client.query(
            `INSERT INTO signipedia_related_symbols (symbol_id, related_symbol_id, relation_type) VALUES ($1, $2, 'related') ON CONFLICT DO NOTHING`,
            [symbolId, relatedSymbolId]
          );
        }
      }

      for (const alias of catalog.aliases) {
        const symbolId = symbolIdMap.get(alias.symbolId) || alias.symbolId;
        if (!symbolId || !alias.alias) continue;
        await client.query(
          `INSERT INTO signipedia_symbol_aliases (symbol_id, alias, language) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [symbolId, alias.alias, alias.language || "es"]
        );
      }

      for (const tag of catalog.tags) {
        const symbolId = symbolIdMap.get(tag.symbolId) || tag.symbolId;
        if (!symbolId || !tag.tag) continue;
        await client.query(
          `INSERT INTO signipedia_symbol_tags (symbol_id, tag, language) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [symbolId, tag.tag, tag.language || "es"]
        );
      }

      for (const synonym of catalog.synonyms) {
        const symbolId = symbolIdMap.get(synonym.symbolId || synonym.symbolSlug || "") || synonym.symbolId || synonym.symbolSlug || "";
        if (!symbolId || !synonym.synonym) continue;
        await client.query(
          `INSERT INTO signipedia_symbol_synonyms (symbol_id, synonym, language) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [symbolId, synonym.synonym, synonym.language || "es"]
        );
      }

      for (const period of catalog.historicalPeriods) {
        const symbolId = symbolIdMap.get(period.symbolId) || period.symbolId;
        if (!symbolId) continue;
        await client.query(
          `INSERT INTO signipedia_historical_periods (symbol_id, label, start_year, end_year, description) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
          [symbolId, period.label, period.startYear, period.endYear, period.description]
        );
      }

      for (const source of catalog.sources) {
        const symbolId = symbolIdMap.get(source.symbolId) || source.symbolId;
        if (!symbolId) continue;
        await client.query(
          `INSERT INTO signipedia_sources (symbol_id, title, url, author, published_at, citation) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
          [symbolId, source.title, source.url, source.author, source.publishedAt, source.citation]
        );
      }

      for (const media of catalog.media) {
        const symbolId = symbolIdMap.get(media.symbolId) || media.symbolId;
        if (!symbolId) continue;
        await client.query(
          `INSERT INTO signipedia_media (symbol_id, kind, url, alt_text, credit, width, height, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
          [symbolId, media.kind, media.url, media.altText, media.credit, media.width, media.height, media.sortOrder]
        );
      }

      for (const translation of catalog.translations) {
        const symbolId = symbolIdMap.get(translation.symbolId) || translation.symbolId;
        if (!symbolId) continue;
        await client.query(
          `INSERT INTO signipedia_translations (symbol_id, language, field, value) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [symbolId, translation.language, translation.field, translation.value]
        );
      }

      for (const favorite of catalog.favorites) {
        const symbolId = symbolIdMap.get(favorite.symbolId) || favorite.symbolId;
        if (!symbolId) continue;
        await client.query(
          `INSERT INTO signipedia_favorites (symbol_id, session_id, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [symbolId, favorite.sessionId, favorite.createdAt || new Date().toISOString()]
        );
      }
    });
  },

  async setSymbolStatus(symbolId: string, status: SymbolStatus) {
    await this.bootstrap();
    const connection = requirePool();
    const result = await connection.query(`UPDATE signipedia_symbols SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`, [symbolId, status]);
    return result.rows[0] ? mapSymbolRow(result.rows[0]) : null;
  },
};
