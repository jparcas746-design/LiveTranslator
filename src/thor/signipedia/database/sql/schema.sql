CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS signipedia_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon text,
  parent_id uuid REFERENCES signipedia_categories(id) ON DELETE SET NULL,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signipedia_symbols (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  meaning text NOT NULL,
  history text NOT NULL DEFAULT '',
  origin text NOT NULL DEFAULT '',
  current_uses text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  canonical_glyph text NOT NULL DEFAULT '',
  variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  curiosities jsonb NOT NULL DEFAULT '[]'::jsonb,
  language text NOT NULL DEFAULT 'es',
  category_id uuid NOT NULL REFERENCES signipedia_categories(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),
  is_featured boolean NOT NULL DEFAULT false,
  embedding vector(768),
  vision_embedding vector(512),
  vision_embedding_source text,
  search_document tsvector,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE signipedia_symbols
  ADD COLUMN IF NOT EXISTS variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS curiosities jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS vision_embedding vector(512),
  ADD COLUMN IF NOT EXISTS vision_embedding_source text,
  ADD COLUMN IF NOT EXISTS search_document tsvector;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'signipedia_symbols'::regclass
      AND attname = 'search_document'
      AND attgenerated = 's'
  ) THEN
    ALTER TABLE signipedia_symbols ALTER COLUMN search_document DROP EXPRESSION;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION signipedia_compute_search_document(
  p_name text,
  p_meaning text,
  p_history text,
  p_origin text,
  p_current_uses text
) RETURNS tsvector
LANGUAGE sql
AS $$
  SELECT
    setweight(to_tsvector('simple', public.unaccent(coalesce(p_name, ''))), 'A') ||
    setweight(to_tsvector('simple', public.unaccent(coalesce(p_meaning, ''))), 'B') ||
    setweight(to_tsvector('simple', public.unaccent(coalesce(p_history, ''))), 'C') ||
    setweight(to_tsvector('simple', public.unaccent(coalesce(p_origin, ''))), 'C') ||
    setweight(to_tsvector('simple', public.unaccent(coalesce(p_current_uses, ''))), 'C');
$$;

CREATE OR REPLACE FUNCTION signipedia_set_search_document()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_document := signipedia_compute_search_document(
    NEW.name,
    NEW.meaning,
    NEW.history,
    NEW.origin,
    NEW.current_uses
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_signipedia_symbols_search_document ON signipedia_symbols;

CREATE TRIGGER trg_signipedia_symbols_search_document
BEFORE INSERT OR UPDATE OF name, meaning, history, origin, current_uses
ON signipedia_symbols
FOR EACH ROW
EXECUTE FUNCTION signipedia_set_search_document();

UPDATE signipedia_symbols
SET search_document = signipedia_compute_search_document(
  name,
  meaning,
  history,
  origin,
  current_uses
)
WHERE search_document IS DISTINCT FROM signipedia_compute_search_document(
  name,
  meaning,
  history,
  origin,
  current_uses
);

CREATE OR REPLACE FUNCTION immutable_unaccent(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT public.unaccent(coalesce(input, ''));
$$;

CREATE TABLE IF NOT EXISTS signipedia_symbol_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol_id uuid NOT NULL REFERENCES signipedia_symbols(id) ON DELETE CASCADE,
  alias text NOT NULL,
  language text NOT NULL DEFAULT 'es',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(symbol_id, alias, language)
);

CREATE TABLE IF NOT EXISTS signipedia_symbol_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol_id uuid NOT NULL REFERENCES signipedia_symbols(id) ON DELETE CASCADE,
  tag text NOT NULL,
  language text NOT NULL DEFAULT 'es',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(symbol_id, tag, language)
);

CREATE TABLE IF NOT EXISTS signipedia_symbol_synonyms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol_id uuid NOT NULL REFERENCES signipedia_symbols(id) ON DELETE CASCADE,
  synonym text NOT NULL,
  language text NOT NULL DEFAULT 'es',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(symbol_id, synonym, language)
);

CREATE TABLE IF NOT EXISTS signipedia_related_symbols (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol_id uuid NOT NULL REFERENCES signipedia_symbols(id) ON DELETE CASCADE,
  related_symbol_id uuid NOT NULL REFERENCES signipedia_symbols(id) ON DELETE CASCADE,
  relation_type text NOT NULL DEFAULT 'related' CHECK (relation_type IN ('related', 'similar', 'historical', 'semantic')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(symbol_id, related_symbol_id, relation_type)
);

CREATE TABLE IF NOT EXISTS signipedia_historical_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol_id uuid NOT NULL REFERENCES signipedia_symbols(id) ON DELETE CASCADE,
  label text NOT NULL,
  start_year integer,
  end_year integer,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signipedia_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol_id uuid NOT NULL REFERENCES signipedia_symbols(id) ON DELETE CASCADE,
  title text NOT NULL,
  url text,
  author text,
  published_at timestamptz,
  citation text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signipedia_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol_id uuid NOT NULL REFERENCES signipedia_symbols(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('image', 'video', 'audio', 'document')),
  url text NOT NULL,
  alt_text text,
  credit text,
  width integer,
  height integer,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signipedia_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol_id uuid NOT NULL REFERENCES signipedia_symbols(id) ON DELETE CASCADE,
  language text NOT NULL,
  field text NOT NULL CHECK (field IN ('name', 'meaning', 'history', 'origin', 'currentUses')),
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(symbol_id, language, field)
);

CREATE TABLE IF NOT EXISTS signipedia_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol_id uuid NOT NULL REFERENCES signipedia_symbols(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(symbol_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_signipedia_symbols_category_id ON signipedia_symbols(category_id);
CREATE INDEX IF NOT EXISTS idx_signipedia_symbols_status ON signipedia_symbols(status);
CREATE INDEX IF NOT EXISTS idx_signipedia_symbols_featured ON signipedia_symbols(is_featured);
CREATE INDEX IF NOT EXISTS idx_signipedia_symbols_search_document ON signipedia_symbols USING GIN (search_document);
CREATE INDEX IF NOT EXISTS idx_signipedia_symbols_name_trgm ON signipedia_symbols USING GIN (immutable_unaccent(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_signipedia_symbols_meaning_trgm ON signipedia_symbols USING GIN (immutable_unaccent(meaning) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_signipedia_aliases_alias_trgm ON signipedia_symbol_aliases USING GIN (immutable_unaccent(alias) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_signipedia_tags_tag_trgm ON signipedia_symbol_tags USING GIN (immutable_unaccent(tag) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_signipedia_synonyms_synonym_trgm ON signipedia_symbol_synonyms USING GIN (immutable_unaccent(synonym) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_signipedia_favorites_session_id ON signipedia_favorites(session_id);
