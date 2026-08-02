export type SymbolStatus = "draft" | "review" | "published" | "archived";

export type SignipediaCategory = {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon?: string | null;
  parentId?: string | null;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
};

export type SignipediaSymbol = {
  id: string;
  slug: string;
  name: string;
  meaning: string;
  history: string;
  origin: string;
  currentUses: string;
  variants: string[];
  curiosities: string[];
  synonyms: string[];
  categoryId: string;
  status: SymbolStatus;
  isFeatured: boolean;
  description: string;
  canonicalGlyph: string;
  language: string;
  createdAt: string;
  updatedAt: string;
};

export type SymbolAlias = {
  id: string;
  symbolId: string;
  alias: string;
  language: string;
};

export type SymbolTag = {
  id: string;
  symbolId: string;
  tag: string;
  language: string;
};

export type RelatedSymbol = {
  id: string;
  symbolId: string;
  relatedSymbolId: string;
  relationType: "related" | "similar" | "historical" | "semantic";
};

export type HistoricalPeriod = {
  id: string;
  symbolId: string;
  label: string;
  startYear: number | null;
  endYear: number | null;
  description: string;
};

export type SourceRecord = {
  id: string;
  symbolId: string;
  title: string;
  url: string | null;
  author: string | null;
  publishedAt: string | null;
  citation: string | null;
};

export type MediaRecord = {
  id: string;
  symbolId: string;
  kind: "image" | "video" | "audio" | "document";
  url: string;
  altText: string | null;
  credit: string | null;
  width: number | null;
  height: number | null;
  sortOrder: number;
};

export type TranslationRecord = {
  id: string;
  symbolId: string;
  language: string;
  field: "name" | "meaning" | "history" | "origin" | "currentUses";
  value: string;
};

export type FavoriteRecord = {
  id: string;
  symbolId: string;
  sessionId: string;
  createdAt: string;
};

export type SymbolSearchQuery = {
  query?: string;
  categorySlug?: string;
  tag?: string;
  language?: string;
  limit?: number;
  offset?: number;
  fuzzy?: boolean;
};

export type SearchHit = {
  score: number;
  symbol: SignipediaSymbol;
  category: SignipediaCategory | null;
  aliases: string[];
  tags: string[];
};

export type SignipediaSymbolDetail = {
  symbol: SignipediaSymbol;
  category: SignipediaCategory | null;
  aliases: string[];
  tags: string[];
  synonyms: string[];
  relatedSymbols: RelatedSymbol[];
  historicalPeriods: HistoricalPeriod[];
  sources: SourceRecord[];
  media: MediaRecord[];
  translations: TranslationRecord[];
};

export type SignipediaCatalogStats = {
  symbolCount: number;
  categoryCount: number;
  featuredCount: number;
  aliasCount: number;
  tagCount: number;
  synonymCount: number;
};

export type SymbolUpsertInput = {
  slug: string;
  name: string;
  meaning: string;
  history: string;
  origin: string;
  currentUses: string;
  categoryId: string;
  status?: SymbolStatus;
  isFeatured?: boolean;
  description?: string;
  canonicalGlyph?: string;
  language?: string;
};

export type CategoryUpsertInput = {
  slug: string;
  name: string;
  description: string;
  icon?: string | null;
  parentId?: string | null;
  orderIndex?: number;
};

export type CatalogExport = {
  categories: SignipediaCategory[];
  symbols: Array<
    SignipediaSymbol & {
      glyph: string;
      aliases: string[];
      keywords: string[];
      synonyms?: string[];
      featured?: boolean;
    }
  >;
  aliases: SymbolAlias[];
  tags: SymbolTag[];
  synonyms: Array<{
    symbolSlug?: string;
    symbolId?: string;
    synonym: string;
    language?: string;
  }>;
  relatedSymbols: RelatedSymbol[];
  historicalPeriods: HistoricalPeriod[];
  sources: SourceRecord[];
  media: MediaRecord[];
  translations: TranslationRecord[];
  favorites: FavoriteRecord[];
};
