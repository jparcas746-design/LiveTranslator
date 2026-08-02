import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  getCategoryById,
  getRelatedSymbols,
  signipediaCategories,
  signipediaSymbols,
} from "@/lib/signipedia/catalog";
import type {
  CategoryUpsertInput,
  CatalogExport,
  FavoriteRecord,
  HistoricalPeriod,
  MediaRecord,
  RelatedSymbol,
  SearchHit,
  SignipediaCategory,
  SignipediaSymbol,
  SignipediaSymbolDetail,
  SourceRecord,
  SymbolAlias,
  SymbolSearchQuery,
  SymbolStatus,
  SymbolTag,
  SymbolUpsertInput,
  TranslationRecord,
} from "@/thor/signipedia/types";
import type { SignipediaRepository } from "@/thor/signipedia/database/repository";

type RuntimeStore = {
  categories: Map<string, SignipediaCategory>;
  symbols: Map<string, SignipediaSymbol>;
  aliases: Map<string, SymbolAlias[]>;
  tags: Map<string, SymbolTag[]>;
  synonyms: Map<string, Array<{ id: string; symbolId: string; synonym: string; language: string }>>;
  relatedSymbols: Map<string, RelatedSymbol[]>;
  historicalPeriods: Map<string, HistoricalPeriod[]>;
  sources: Map<string, SourceRecord[]>;
  media: Map<string, MediaRecord[]>;
  translations: Map<string, TranslationRecord[]>;
  favorites: Map<string, FavoriteRecord[]>;
};

const runtime: RuntimeStore = {
  categories: new Map(),
  symbols: new Map(),
  aliases: new Map(),
  tags: new Map(),
  synonyms: new Map(),
  relatedSymbols: new Map(),
  historicalPeriods: new Map(),
  sources: new Map(),
  media: new Map(),
  translations: new Map(),
  favorites: new Map(),
};

function normalizeKey(value: string) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function resolveLocalImageMap() {
  const mediaDir = path.resolve(process.cwd(), "public", "signipedia-media");
  if (!existsSync(mediaDir)) {
    return new Map<string, string>();
  }

  const files = readdirSync(mediaDir).filter((name) => /\.(png|jpe?g|webp|gif|avif)$/i.test(name));
  const urls = files.map((name) => `/signipedia-media/${name}`);
  const bySymbol = new Map<string, string>();

  const explicitAliases: Record<string, string[]> = {
    infinito: ["infinite"],
    radioactivo: ["radioactividad"],
    "fleur-de-lis": ["fleur-du-lis", "fleurdelis"],
  };

  for (const symbol of signipediaSymbols) {
    const slugKey = normalizeKey(symbol.slug);
    const aliasKeys = (explicitAliases[symbol.slug] || []).map((alias) => normalizeKey(alias));

    const candidate = urls.find((url) => {
      const fileKey = normalizeKey(url);
      if (fileKey.includes(slugKey)) {
        return true;
      }

      return aliasKeys.some((aliasKey) => aliasKey && fileKey.includes(aliasKey));
    });

    if (candidate) {
      bySymbol.set(symbol.slug, candidate);
    }
  }

  return bySymbol;
}

function createId(prefix: string) {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalize(value: string) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getAliasList(symbolId: string) {
  return runtime.aliases.get(symbolId) || [];
}

function getTagList(symbolId: string) {
  return runtime.tags.get(symbolId) || [];
}

function getSynonymList(symbolId: string) {
  return runtime.synonyms.get(symbolId) || [];
}

function ensureSeeded() {
  if (runtime.symbols.size > 0) {
    return;
  }

  const now = new Date().toISOString();
  const localImageMap = resolveLocalImageMap();

  for (const category of signipediaCategories) {
    runtime.categories.set(category.id, {
      id: category.id,
      slug: category.id,
      name: category.label,
      description: category.description,
      icon: null,
      parentId: null,
      orderIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const symbol of signipediaSymbols) {
    const category = getCategoryById(symbol.categoryId);
    const record: SignipediaSymbol = {
      id: symbol.slug,
      slug: symbol.slug,
      name: symbol.name,
      meaning: symbol.meaning,
      history: symbol.history,
      origin: symbol.origin,
      currentUses: symbol.currentUses,
      variants: symbol.variants,
      curiosities: symbol.curiosities,
      synonyms: symbol.synonyms || symbol.aliases,
      categoryId: symbol.categoryId,
      status: "published",
      isFeatured: Boolean(symbol.featured),
      description: symbol.meaning,
      canonicalGlyph: symbol.glyph,
      imageUrl: localImageMap.get(symbol.slug) || null,
      language: "es",
      createdAt: now,
      updatedAt: now,
    };

    runtime.symbols.set(record.id, record);
    runtime.aliases.set(
      record.id,
      symbol.aliases.map((alias) => ({
        id: createId("alias"),
        symbolId: record.id,
        alias,
        language: "es",
      }))
    );
    runtime.tags.set(
      record.id,
      symbol.keywords.map((tag) => ({
        id: createId("tag"),
        symbolId: record.id,
        tag,
        language: "es",
      }))
    );

    runtime.synonyms.set(
      record.id,
      (symbol.synonyms || symbol.aliases).map((synonym) => ({
        id: createId("synonym"),
        symbolId: record.id,
        synonym,
        language: "es",
      }))
    );

    runtime.relatedSymbols.set(
      record.id,
      getRelatedSymbols(symbol).map((related: { slug: string }) => ({
        id: createId("related"),
        symbolId: record.id,
        relatedSymbolId: related.slug,
        relationType: "related",
      }))
    );

    runtime.historicalPeriods.set(record.id, [
      {
        id: createId("period"),
        symbolId: record.id,
        label: category?.label || "General",
        startYear: null,
        endYear: null,
        description: symbol.history,
      },
    ]);
  }
}

function toSearchHit(symbol: SignipediaSymbol, score = 1): SearchHit {
  const category = runtime.categories.get(symbol.categoryId) || null;
  return {
    score,
    symbol,
    category,
    aliases: getAliasList(symbol.id).map((item) => item.alias),
    tags: getTagList(symbol.id).map((item) => item.tag),
  };
}

function toDetail(symbol: SignipediaSymbol): SignipediaSymbolDetail {
  const category = runtime.categories.get(symbol.categoryId) || null;
  return {
    symbol,
    category,
    aliases: getAliasList(symbol.id).map((item) => item.alias),
    tags: getTagList(symbol.id).map((item) => item.tag),
    synonyms: getSynonymList(symbol.id).map((item) => item.synonym),
    relatedSymbols: (runtime.relatedSymbols.get(symbol.id) || []).map((item) => {
      return {
        id: item.id,
        symbolId: item.symbolId,
        relatedSymbolId: item.relatedSymbolId,
        relationType: item.relationType,
      };
    }),
    historicalPeriods: runtime.historicalPeriods.get(symbol.id) || [],
    sources: runtime.sources.get(symbol.id) || [],
    media: runtime.media.get(symbol.id) || [],
    translations: runtime.translations.get(symbol.id) || [],
  };
}

function matchesText(symbol: SignipediaSymbol, text: string) {
  const haystack = [
    symbol.slug,
    symbol.name,
    symbol.meaning,
    symbol.history,
    symbol.origin,
    symbol.currentUses,
    symbol.description,
    symbol.canonicalGlyph,
    symbol.variants.join(" "),
    symbol.curiosities.join(" "),
    getAliasList(symbol.id).map((item) => item.alias).join(" "),
    getTagList(symbol.id).map((item) => item.tag).join(" "),
    getSynonymList(symbol.id).map((item) => item.synonym).join(" "),
    runtime.categories.get(symbol.categoryId)?.name || "",
  ].join(" ");

  return normalize(haystack).includes(normalize(text));
}

function matchesQuery(symbol: SignipediaSymbol, query: SymbolSearchQuery) {
  const q = normalize(query.query || "");
  const categoryMatch = query.categorySlug ? runtime.categories.get(symbol.categoryId)?.slug === query.categorySlug : true;
  const languageMatch = query.language ? symbol.language === query.language : true;
  const tagMatch = query.tag
    ? getTagList(symbol.id).some((item) => normalize(item.tag).includes(normalize(query.tag || "")))
    : true;

  if (!q) {
    return categoryMatch && languageMatch && tagMatch;
  }

  return categoryMatch && languageMatch && tagMatch && matchesText(symbol, q);
}

function cloneSymbol(symbol: SignipediaSymbol) {
  return { ...symbol };
}

export const inMemorySignipediaRepository: SignipediaRepository = {
  isConfigured() {
    return true;
  },

  async bootstrap() {
    ensureSeeded();
  },

  async getStats() {
    ensureSeeded();
    const symbols = Array.from(runtime.symbols.values());
    const imageCount = Array.from(runtime.media.values()).reduce(
      (sum, entries) => sum + entries.filter((item) => item.kind === "image").length,
      0
    );
    return {
      symbolCount: symbols.length,
      categoryCount: runtime.categories.size,
      featuredCount: symbols.filter((symbol) => symbol.isFeatured).length,
      aliasCount: Array.from(runtime.aliases.values()).reduce((sum, entries) => sum + entries.length, 0),
      tagCount: Array.from(runtime.tags.values()).reduce((sum, entries) => sum + entries.length, 0),
      synonymCount: Array.from(runtime.synonyms.values()).reduce((sum, entries) => sum + entries.length, 0),
      imageCount,
      visionEmbeddingCount: 0,
    };
  },

  async listCategories() {
    ensureSeeded();
    return Array.from(runtime.categories.values()).sort((left, right) => left.orderIndex - right.orderIndex || left.name.localeCompare(right.name, "es"));
  },

  async getCategoryBySlug(slug: string) {
    ensureSeeded();
    return Array.from(runtime.categories.values()).find((category) => category.slug === slug) || null;
  },

  async upsertCategory(input: CategoryUpsertInput) {
    ensureSeeded();
    const now = new Date().toISOString();
    const existing = Array.from(runtime.categories.values()).find((category) => category.slug === input.slug);
    const category: SignipediaCategory = {
      id: existing?.id || createId("category"),
      slug: input.slug,
      name: input.name,
      description: input.description,
      icon: input.icon ?? null,
      parentId: input.parentId ?? null,
      orderIndex: input.orderIndex ?? existing?.orderIndex ?? 0,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    runtime.categories.set(category.id, category);
    return category;
  },

  async deleteCategory(categoryId: string) {
    ensureSeeded();
    runtime.categories.delete(categoryId);
  },

  async listSymbols(query?: SymbolSearchQuery) {
    ensureSeeded();
    const limit = Math.max(1, Math.min(200, Math.floor(query?.limit || 50)));
    const offset = Math.max(0, Math.floor(query?.offset || 0));
    const results = Array.from(runtime.symbols.values())
      .filter((symbol) => matchesQuery(symbol, query || {}))
      .map((symbol) => {
        const haystack = normalize(
          [symbol.name, symbol.meaning, symbol.history, symbol.origin, symbol.currentUses, getAliasList(symbol.id).map((item) => item.alias).join(" "), getTagList(symbol.id).map((item) => item.tag).join(" ")].join(" ")
        );
        const score = query?.query ? (haystack.includes(normalize(query.query)) ? 1 : 0.5) : Number(symbol.isFeatured) + 0.1;
        return toSearchHit(symbol, score);
      })
      .sort((left, right) => right.score - left.score || left.symbol.name.localeCompare(right.symbol.name, "es"));

    return results.slice(offset, offset + limit);
  },

  async countSymbols(query?: SymbolSearchQuery) {
    ensureSeeded();
    return Array.from(runtime.symbols.values()).filter((symbol) => matchesQuery(symbol, query || {})).length;
  },

  async getSymbolBySlug(slug: string) {
    ensureSeeded();
    return Array.from(runtime.symbols.values()).find((symbol) => symbol.slug === slug) || null;
  },

  async getSymbolById(symbolId: string) {
    ensureSeeded();
    return runtime.symbols.get(symbolId) || null;
  },

  async getSymbolDetailBySlug(slug: string) {
    ensureSeeded();
    const symbol = Array.from(runtime.symbols.values()).find((entry) => entry.slug === slug) || null;
    return symbol ? toDetail(symbol) : null;
  },

  async getSymbolDetailById(symbolId: string) {
    ensureSeeded();
    const symbol = runtime.symbols.get(symbolId) || null;
    return symbol ? toDetail(symbol) : null;
  },

  async createSymbol(input: SymbolUpsertInput) {
    ensureSeeded();
    const now = new Date().toISOString();
    const symbol: SignipediaSymbol = {
      id: createId("symbol"),
      slug: input.slug,
      name: input.name,
      meaning: input.meaning,
      history: input.history,
      origin: input.origin,
      currentUses: input.currentUses,
      variants: input.variants || [],
      curiosities: input.curiosities || [],
      synonyms: [],
      categoryId: input.categoryId,
      status: input.status || "draft",
      isFeatured: Boolean(input.isFeatured),
      description: input.description || input.meaning,
      canonicalGlyph: input.canonicalGlyph || "",
      imageUrl: null,
      language: input.language || "es",
      createdAt: now,
      updatedAt: now,
    };
    runtime.symbols.set(symbol.id, symbol);
    return symbol;
  },

  async updateSymbol(symbolId: string, input: Partial<SymbolUpsertInput>) {
    ensureSeeded();
    const existing = runtime.symbols.get(symbolId);
    if (!existing) {
      return null;
    }

    const updated: SignipediaSymbol = {
      ...existing,
      slug: input.slug ?? existing.slug,
      name: input.name ?? existing.name,
      meaning: input.meaning ?? existing.meaning,
      history: input.history ?? existing.history,
      origin: input.origin ?? existing.origin,
      currentUses: input.currentUses ?? existing.currentUses,
      variants: input.variants ?? existing.variants,
      curiosities: input.curiosities ?? existing.curiosities,
      synonyms: existing.synonyms,
      categoryId: input.categoryId ?? existing.categoryId,
      status: input.status ?? existing.status,
      isFeatured: typeof input.isFeatured === "boolean" ? input.isFeatured : existing.isFeatured,
      description: input.description ?? existing.description,
      canonicalGlyph: input.canonicalGlyph ?? existing.canonicalGlyph,
      imageUrl: existing.imageUrl,
      language: input.language ?? existing.language,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    runtime.symbols.set(symbolId, updated);
    return updated;
  },

  async deleteSymbol(symbolId: string) {
    ensureSeeded();
    runtime.symbols.delete(symbolId);
    runtime.aliases.delete(symbolId);
    runtime.tags.delete(symbolId);
    runtime.relatedSymbols.delete(symbolId);
    runtime.historicalPeriods.delete(symbolId);
    runtime.sources.delete(symbolId);
    runtime.media.delete(symbolId);
    runtime.translations.delete(symbolId);
    runtime.synonyms.delete(symbolId);
    for (const [sessionId, favorites] of runtime.favorites.entries()) {
      runtime.favorites.set(
        sessionId,
        favorites.filter((favorite) => favorite.symbolId !== symbolId)
      );
    }
  },

  async setAliases(symbolId: string, aliases: string[], language = "es") {
    ensureSeeded();
    const values = aliases.filter(Boolean).map((alias) => ({
      id: createId("alias"),
      symbolId,
      alias: alias.trim(),
      language,
    }));
    runtime.aliases.set(symbolId, values);
    return values;
  },

  async setTags(symbolId: string, tags: string[], language = "es") {
    ensureSeeded();
    const values = tags.filter(Boolean).map((tag) => ({
      id: createId("tag"),
      symbolId,
      tag: tag.trim(),
      language,
    }));
    runtime.tags.set(symbolId, values);
    return values;
  },

  async setSynonyms(symbolId: string, synonyms: string[], language = "es") {
    ensureSeeded();
    const values = synonyms.filter(Boolean).map((synonym) => ({
      id: createId("synonym"),
      symbolId,
      synonym: synonym.trim(),
      language,
    }));
    runtime.synonyms.set(symbolId, values);
    return values;
  },

  async setRelatedSymbols(symbolId: string, related) {
    ensureSeeded();
    const values = related.map((item) => ({
      id: createId("related"),
      symbolId,
      relatedSymbolId: item.relatedSymbolId,
      relationType: item.relationType || "related",
    }));
    runtime.relatedSymbols.set(symbolId, values);
    return values;
  },

  async setHistoricalPeriods(symbolId: string, periods) {
    ensureSeeded();
    const values = periods.map((period) => ({
      id: createId("period"),
      symbolId,
      label: period.label,
      startYear: period.startYear,
      endYear: period.endYear,
      description: period.description,
    }));
    runtime.historicalPeriods.set(symbolId, values);
    return values;
  },

  async setSources(symbolId: string, sources) {
    ensureSeeded();
    const values = sources.map((source) => ({
      id: createId("source"),
      symbolId,
      title: source.title,
      url: source.url,
      author: source.author,
      publishedAt: source.publishedAt,
      citation: source.citation,
    }));
    runtime.sources.set(symbolId, values);
    return values;
  },

  async setMedia(symbolId: string, media) {
    ensureSeeded();
    const values = media.map((item) => ({
      id: createId("media"),
      symbolId,
      kind: item.kind,
      url: item.url,
      altText: item.altText,
      credit: item.credit,
      width: item.width,
      height: item.height,
      sortOrder: item.sortOrder,
    }));
    runtime.media.set(symbolId, values);

    const symbol = runtime.symbols.get(symbolId);
    if (symbol) {
      const primaryImage = values
        .filter((item) => item.kind === "image")
        .sort((left, right) => left.sortOrder - right.sortOrder)[0]?.url || null;

      runtime.symbols.set(symbolId, {
        ...symbol,
        imageUrl: primaryImage,
        updatedAt: new Date().toISOString(),
      });
    }

    return values;
  },

  async setTranslations(symbolId: string, translations) {
    ensureSeeded();
    const values = translations.map((item) => ({
      id: createId("translation"),
      symbolId,
      language: item.language,
      field: item.field,
      value: item.value,
    }));
    runtime.translations.set(symbolId, values);
    return values;
  },

  async listFavorites(sessionId: string) {
    ensureSeeded();
    return runtime.favorites.get(sessionId) || [];
  },

  async toggleFavorite(sessionId: string, symbolId: string) {
    ensureSeeded();
    const favorites = runtime.favorites.get(sessionId) || [];
    const found = favorites.find((favorite) => favorite.symbolId === symbolId);

    if (found) {
      runtime.favorites.set(
        sessionId,
        favorites.filter((favorite) => favorite.symbolId !== symbolId)
      );
      return { favorited: false };
    }

    const favorite: FavoriteRecord = {
      id: createId("favorite"),
      symbolId,
      sessionId,
      createdAt: new Date().toISOString(),
    };
    runtime.favorites.set(sessionId, [favorite, ...favorites]);
    return { favorited: true };
  },

  async removeFavorite(sessionId: string, symbolId: string) {
    ensureSeeded();
    const favorites = runtime.favorites.get(sessionId) || [];
    runtime.favorites.set(
      sessionId,
      favorites.filter((favorite) => favorite.symbolId !== symbolId)
    );
  },

  async importCatalog(catalog: CatalogExport) {
    ensureSeeded();
    for (const category of catalog.categories) {
      runtime.categories.set(category.id, category);
    }
    for (const symbol of catalog.symbols) {
      runtime.symbols.set(symbol.id, cloneSymbol(symbol));
    }
    for (const record of catalog.aliases) {
      const list = runtime.aliases.get(record.symbolId) || [];
      list.push(record);
      runtime.aliases.set(record.symbolId, list);
    }
    for (const record of catalog.tags) {
      const list = runtime.tags.get(record.symbolId) || [];
      list.push(record);
      runtime.tags.set(record.symbolId, list);
    }
    for (const record of catalog.synonyms) {
      const symbolId = record.symbolId || record.symbolSlug || "";
      if (!symbolId) {
        continue;
      }

      const list = runtime.synonyms.get(symbolId) || [];
      list.push({
        id: createId("synonym"),
        symbolId,
        synonym: record.synonym,
        language: record.language || "es",
      });
      runtime.synonyms.set(symbolId, list);
    }
    for (const record of catalog.relatedSymbols) {
      const list = runtime.relatedSymbols.get(record.symbolId) || [];
      list.push(record);
      runtime.relatedSymbols.set(record.symbolId, list);
    }
    for (const record of catalog.historicalPeriods) {
      const list = runtime.historicalPeriods.get(record.symbolId) || [];
      list.push(record);
      runtime.historicalPeriods.set(record.symbolId, list);
    }
    for (const record of catalog.sources) {
      const list = runtime.sources.get(record.symbolId) || [];
      list.push(record);
      runtime.sources.set(record.symbolId, list);
    }
    for (const record of catalog.media) {
      const list = runtime.media.get(record.symbolId) || [];
      list.push(record);
      runtime.media.set(record.symbolId, list);
    }
    for (const record of catalog.translations) {
      const list = runtime.translations.get(record.symbolId) || [];
      list.push(record);
      runtime.translations.set(record.symbolId, list);
    }
    for (const record of catalog.favorites) {
      const list = runtime.favorites.get(record.sessionId) || [];
      list.push(record);
      runtime.favorites.set(record.sessionId, list);
    }
  },

  async setSymbolStatus(symbolId: string, status: SymbolStatus) {
    ensureSeeded();
    const existing = runtime.symbols.get(symbolId);
    if (!existing) {
      return null;
    }
    const updated = { ...existing, status, updatedAt: new Date().toISOString() };
    runtime.symbols.set(symbolId, updated);
    return updated;
  },
};
