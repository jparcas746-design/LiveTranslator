import type {
  CategoryUpsertInput,
  CatalogExport,
  FavoriteRecord,
  HistoricalPeriod,
  MediaRecord,
  RelatedSymbol,
  SearchHit,
  SignipediaCategory,
  SignipediaCatalogStats,
  SignipediaSymbolDetail,
  SignipediaSymbol,
  SourceRecord,
  SymbolAlias,
  SymbolSearchQuery,
  SymbolStatus,
  SymbolTag,
  SymbolUpsertInput,
  TranslationRecord,
} from "@/thor/signipedia/types";

export type SignipediaRepository = {
  isConfigured: () => boolean;
  bootstrap: () => Promise<void>;
  getStats: () => Promise<SignipediaCatalogStats>;
  listCategories: () => Promise<SignipediaCategory[]>;
  getCategoryBySlug: (slug: string) => Promise<SignipediaCategory | null>;
  upsertCategory: (input: CategoryUpsertInput) => Promise<SignipediaCategory>;
  deleteCategory: (categoryId: string) => Promise<void>;
  listSymbols: (query?: SymbolSearchQuery) => Promise<SearchHit[]>;
  countSymbols: (query?: SymbolSearchQuery) => Promise<number>;
  getSymbolBySlug: (slug: string) => Promise<SignipediaSymbol | null>;
  getSymbolById: (symbolId: string) => Promise<SignipediaSymbol | null>;
  getSymbolDetailBySlug: (slug: string) => Promise<SignipediaSymbolDetail | null>;
  getSymbolDetailById: (symbolId: string) => Promise<SignipediaSymbolDetail | null>;
  createSymbol: (input: SymbolUpsertInput) => Promise<SignipediaSymbol>;
  updateSymbol: (symbolId: string, input: Partial<SymbolUpsertInput>) => Promise<SignipediaSymbol | null>;
  deleteSymbol: (symbolId: string) => Promise<void>;
  setAliases: (symbolId: string, aliases: string[], language?: string) => Promise<SymbolAlias[]>;
  setTags: (symbolId: string, tags: string[], language?: string) => Promise<SymbolTag[]>;
  setSynonyms: (symbolId: string, synonyms: string[], language?: string) => Promise<Array<{ id: string; symbolId: string; synonym: string; language: string }>>;
  setRelatedSymbols: (
    symbolId: string,
    related: Array<{ relatedSymbolId: string; relationType?: RelatedSymbol["relationType"] }>
  ) => Promise<RelatedSymbol[]>;
  setHistoricalPeriods: (
    symbolId: string,
    periods: Array<Omit<HistoricalPeriod, "id" | "symbolId">>
  ) => Promise<HistoricalPeriod[]>;
  setSources: (
    symbolId: string,
    sources: Array<Omit<SourceRecord, "id" | "symbolId">>
  ) => Promise<SourceRecord[]>;
  setMedia: (
    symbolId: string,
    media: Array<Omit<MediaRecord, "id" | "symbolId">>
  ) => Promise<MediaRecord[]>;
  setTranslations: (
    symbolId: string,
    translations: Array<Omit<TranslationRecord, "id" | "symbolId">>
  ) => Promise<TranslationRecord[]>;
  listFavorites: (sessionId: string) => Promise<FavoriteRecord[]>;
  toggleFavorite: (sessionId: string, symbolId: string) => Promise<{ favorited: boolean }>;
  removeFavorite: (sessionId: string, symbolId: string) => Promise<void>;
  importCatalog: (catalog: CatalogExport) => Promise<void>;
  setSymbolStatus: (symbolId: string, status: SymbolStatus) => Promise<SignipediaSymbol | null>;
};
