import type {
  CatalogExport,
  HistoricalPeriod,
  MediaRecord,
  RelatedSymbol,
  SignipediaCategory,
  SignipediaSymbol,
  SourceRecord,
  SymbolAlias,
  SymbolTag,
  TranslationRecord,
} from "@/thor/signipedia/types";

export type SignipediaImportFormat = "json" | "csv";

export type SignipediaImportDocument = {
  categories?: Array<Partial<SignipediaCategory> & { slug: string }>;
  symbols?: Array<Partial<SignipediaSymbol> & { slug: string; glyph?: string }>;
  aliases?: Array<{ symbolId?: string; symbolSlug?: string; alias?: string; synonym?: string; language?: string }>;
  tags?: Array<{ symbolId?: string; symbolSlug?: string; tag?: string; synonym?: string; language?: string }>;
  synonyms?: Array<{ symbolId?: string; symbolSlug?: string; synonym: string; language?: string }>;
  relatedSymbols?: Array<{ symbolId?: string; symbolSlug?: string; relatedSymbolId?: string; relatedSymbolSlug?: string; relationType?: RelatedSymbol["relationType"] }>;
  historicalPeriods?: Array<{ symbolId?: string; symbolSlug?: string; label: string; startYear: number | null; endYear: number | null; description: string }>;
  sources?: Array<{ symbolId?: string; symbolSlug?: string; title: string; url: string | null; author: string | null; publishedAt: string | null; citation: string | null }>;
  media?: Array<{ symbolId?: string; symbolSlug?: string; kind: MediaRecord["kind"]; url: string; altText: string | null; credit: string | null; width: number | null; height: number | null; sortOrder: number }>;
  translations?: Array<{ symbolId?: string; symbolSlug?: string; language: string; field: TranslationRecord["field"]; value: string }>;
  favorites?: Array<{ symbolId?: string; symbolSlug?: string; sessionId: string; createdAt?: string }>;
};

function parseBoolean(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "y";
}

function parseDelimitedList(value: string) {
  return value
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        current += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function normalizeCategory(row: Partial<SignipediaCategory> & { slug: string; name?: string; description?: string }): SignipediaCategory {
  const now = new Date().toISOString();
  return {
    id: row.id || row.slug,
    slug: row.slug,
    name: row.name || row.slug,
    description: row.description || "",
    icon: row.icon ?? null,
    parentId: row.parentId ?? null,
    orderIndex: row.orderIndex ?? 0,
    createdAt: row.createdAt || now,
    updatedAt: row.updatedAt || now,
  };
}

function normalizeSymbol(row: Partial<SignipediaSymbol> & { slug: string; name?: string; categoryId?: string; glyph?: string; aliases?: string[]; keywords?: string[]; featured?: boolean }) {
  const now = new Date().toISOString();
  return {
    id: row.id || row.slug,
    slug: row.slug,
    name: row.name || row.slug,
    meaning: row.meaning || "",
    history: row.history || "",
    origin: row.origin || "",
    currentUses: row.currentUses || "",
    variants: row.variants || [],
    curiosities: row.curiosities || [],
    synonyms: row.synonyms || [],
    categoryId: row.categoryId || "",
    status: row.status || "draft",
    isFeatured: Boolean(row.isFeatured),
    description: row.description || row.meaning || "",
    canonicalGlyph: row.canonicalGlyph || row.glyph || "",
    language: row.language || "es",
    createdAt: row.createdAt || now,
    updatedAt: row.updatedAt || now,
    glyph: row.canonicalGlyph || row.glyph || "",
    aliases: row.aliases || [],
    keywords: row.keywords || [],
    featured: row.featured,
  };
}

function resolveImportedSymbolId(entry: { symbolId?: string; symbolSlug?: string }) {
  return entry.symbolId || entry.symbolSlug || "";
}

function normalizeCategoryArray(categories?: SignipediaImportDocument["categories"]) {
  return Array.isArray(categories) ? categories.map((category) => normalizeCategory(category)) : [];
}

function normalizeSymbolArray(symbols?: SignipediaImportDocument["symbols"]) {
  return Array.isArray(symbols)
    ? symbols.map((symbol) =>
        normalizeSymbol({
          ...symbol,
          variants: symbol.variants || [],
          curiosities: symbol.curiosities || [],
          synonyms: symbol.synonyms || [],
          aliases: (symbol as { aliases?: string[] }).aliases || [],
          keywords: (symbol as { keywords?: string[] }).keywords || [],
          featured: (symbol as { featured?: boolean }).featured,
          canonicalGlyph: symbol.canonicalGlyph || (symbol as { glyph?: string }).glyph || "",
        })
      )
    : [];
}

function normalizeAliasArray(aliases?: SignipediaImportDocument["aliases"]): SymbolAlias[] {
  return Array.isArray(aliases)
    ? aliases.map((entry) => ({
        id: `${resolveImportedSymbolId(entry)}:alias:${entry.alias || entry.synonym || ""}`,
        symbolId: resolveImportedSymbolId(entry),
        alias: entry.alias || entry.synonym || "",
        language: entry.language || "es",
      }))
    : [];
}

function normalizeTagArray(tags?: SignipediaImportDocument["tags"]): SymbolTag[] {
  return Array.isArray(tags)
    ? tags.map((entry) => ({
        id: `${resolveImportedSymbolId(entry)}:tag:${entry.tag || entry.synonym || ""}`,
        symbolId: resolveImportedSymbolId(entry),
        tag: entry.tag || entry.synonym || "",
        language: entry.language || "es",
      }))
    : [];
}

function normalizeSynonymArray(synonyms?: SignipediaImportDocument["synonyms"]) {
  return Array.isArray(synonyms)
    ? synonyms.map((entry) => ({
        symbolSlug: entry.symbolSlug,
        symbolId: resolveImportedSymbolId(entry),
        synonym: entry.synonym,
        language: entry.language || "es",
      }))
    : [];
}

function normalizeRelatedArray(relatedSymbols?: SignipediaImportDocument["relatedSymbols"]) {
  return Array.isArray(relatedSymbols)
    ? relatedSymbols.map((entry) => ({
        id: `${resolveImportedSymbolId(entry)}:related:${entry.relatedSymbolId || entry.relatedSymbolSlug || ""}`,
        symbolId: resolveImportedSymbolId(entry),
        relatedSymbolId: entry.relatedSymbolId || entry.relatedSymbolSlug || "",
        relationType: entry.relationType || "related",
      }))
    : [];
}

function normalizeHistoricalArray(periods?: SignipediaImportDocument["historicalPeriods"]): HistoricalPeriod[] {
  return Array.isArray(periods)
    ? periods.map((entry) => ({
        id: `${resolveImportedSymbolId(entry)}:period:${entry.label}`,
        symbolId: resolveImportedSymbolId(entry),
        label: entry.label,
        startYear: entry.startYear,
        endYear: entry.endYear,
        description: entry.description,
      }))
    : [];
}

function normalizeSourceArray(sources?: SignipediaImportDocument["sources"]): SourceRecord[] {
  return Array.isArray(sources)
    ? sources.map((entry) => ({
        id: `${resolveImportedSymbolId(entry)}:source:${entry.title}`,
        symbolId: resolveImportedSymbolId(entry),
        title: entry.title,
        url: entry.url,
        author: entry.author,
        publishedAt: entry.publishedAt,
        citation: entry.citation,
      }))
    : [];
}

function normalizeMediaArray(media?: SignipediaImportDocument["media"]): MediaRecord[] {
  return Array.isArray(media)
    ? media.map((entry) => ({
        id: `${resolveImportedSymbolId(entry)}:media:${entry.url}`,
        symbolId: resolveImportedSymbolId(entry),
        kind: entry.kind,
        url: entry.url,
        altText: entry.altText,
        credit: entry.credit,
        width: entry.width,
        height: entry.height,
        sortOrder: entry.sortOrder,
      }))
    : [];
}

function normalizeTranslationArray(translations?: SignipediaImportDocument["translations"]): TranslationRecord[] {
  return Array.isArray(translations)
    ? translations.map((entry) => ({
        id: `${resolveImportedSymbolId(entry)}:translation:${entry.language}:${entry.field}`,
        symbolId: resolveImportedSymbolId(entry),
        language: entry.language,
        field: entry.field,
        value: entry.value,
      }))
    : [];
}

function normalizeFavoriteArray(favorites?: SignipediaImportDocument["favorites"]) {
  return Array.isArray(favorites)
    ? favorites.map((entry) => ({
        id: `${resolveImportedSymbolId(entry)}:favorite:${entry.sessionId}`,
        symbolId: resolveImportedSymbolId(entry),
        sessionId: entry.sessionId,
        createdAt: entry.createdAt || new Date().toISOString(),
      }))
    : [];
}

export function normalizeCatalogImportDocument(document: SignipediaImportDocument): CatalogExport {
  return {
    categories: normalizeCategoryArray(document.categories),
    symbols: normalizeSymbolArray(document.symbols),
    aliases: normalizeAliasArray(document.aliases),
    tags: normalizeTagArray(document.tags),
    synonyms: normalizeSynonymArray(document.synonyms),
    relatedSymbols: normalizeRelatedArray(document.relatedSymbols),
    historicalPeriods: normalizeHistoricalArray(document.historicalPeriods),
    sources: normalizeSourceArray(document.sources),
    media: normalizeMediaArray(document.media),
    translations: normalizeTranslationArray(document.translations),
    favorites: normalizeFavoriteArray(document.favorites),
  };
}

export function parseSignipediaCsvImport(csvText: string): CatalogExport {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return normalizeCatalogImportDocument({ categories: [], symbols: [] });
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const record: Record<string, string> = {};

    headers.forEach((header, index) => {
      record[header] = values[index] || "";
    });

    return record;
  });

  const categoryMap = new Map<string, SignipediaCategory>();
  const symbols = rows.map((row) => {
    const categorySlug = row.categoryslug || row.category_id || row.category || "uncategorized";
    const category = categoryMap.get(categorySlug) || normalizeCategory({
      slug: categorySlug,
      name: row.categoryname || row.category_label || categorySlug,
      description: row.categorydescription || "",
      icon: row.categoryicon || null,
      orderIndex: Number.isFinite(Number(row.categoryorderindex)) ? Number(row.categoryorderindex) : 0,
    });

    categoryMap.set(category.slug, category);

    return normalizeSymbol({
      slug: row.slug,
      name: row.name,
      categoryId: category.slug,
      canonicalGlyph: row.glyph || row.canonicalglyph,
      meaning: row.meaning,
      history: row.history,
      origin: row.origin,
      currentUses: row.currentuses,
      description: row.description,
      language: row.language || "es",
      status: row.status as SignipediaSymbol["status"],
      isFeatured: parseBoolean(row.featured || row.isfeatured || "false"),
      variants: parseDelimitedList(row.variants || ""),
      curiosities: parseDelimitedList(row.curiosities || ""),
      aliases: parseDelimitedList(row.aliases || ""),
      keywords: parseDelimitedList(row.keywords || row.tags || ""),
      synonyms: parseDelimitedList(row.synonyms || ""),
    } as Partial<SignipediaSymbol> & { slug: string; name?: string; categoryId?: string; glyph?: string });
  });

  return normalizeCatalogImportDocument({
    categories: Array.from(categoryMap.values()),
    symbols,
    aliases: rows.flatMap((row) =>
      parseDelimitedList(row.aliases || "").map((alias) => ({ symbolSlug: row.slug, alias, language: row.language || "es" }))
    ),
    tags: rows.flatMap((row) =>
      parseDelimitedList(row.keywords || row.tags || "").map((tag) => ({ symbolSlug: row.slug, tag, language: row.language || "es" }))
    ),
    synonyms: rows.flatMap((row) =>
      parseDelimitedList(row.synonyms || "").map((synonym) => ({ symbolSlug: row.slug, synonym, language: row.language || "es" }))
    ),
    relatedSymbols: [],
    historicalPeriods: [],
    sources: [],
    media: [],
    translations: [],
    favorites: [],
  });
}
