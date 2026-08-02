import type {
  CatalogExport,
  CategoryUpsertInput,
  SignipediaCatalogStats,
  SignipediaSymbolDetail,
  SymbolSearchQuery,
  SymbolStatus,
  SymbolUpsertInput,
} from "@/thor/signipedia/types";
import { resolveSignipediaRepository } from "@/thor/signipedia/database/resolveRepository";

export class SignipediaEngine {
  private readonly repository = resolveSignipediaRepository();

  isConfigured() {
    return this.repository.isConfigured();
  }

  async bootstrap() {
    await this.repository.bootstrap();
  }

  async getStats(): Promise<SignipediaCatalogStats> {
    await this.bootstrap();
    return this.repository.getStats();
  }

  async listCategories() {
    await this.bootstrap();
    return this.repository.listCategories();
  }

  async getCategoryBySlug(slug: string) {
    await this.bootstrap();
    return this.repository.getCategoryBySlug(slug);
  }

  async upsertCategory(input: CategoryUpsertInput) {
    await this.bootstrap();
    return this.repository.upsertCategory(input);
  }

  async deleteCategory(categoryId: string) {
    await this.bootstrap();
    return this.repository.deleteCategory(categoryId);
  }

  async listSymbols(query?: SymbolSearchQuery) {
    await this.bootstrap();
    return this.repository.listSymbols(query);
  }

  async countSymbols(query?: SymbolSearchQuery) {
    await this.bootstrap();
    return this.repository.countSymbols(query);
  }

  async getSymbolBySlug(slug: string) {
    await this.bootstrap();
    return this.repository.getSymbolBySlug(slug);
  }

  async getSymbolById(symbolId: string) {
    await this.bootstrap();
    return this.repository.getSymbolById(symbolId);
  }

  async getSymbolDetailBySlug(slug: string): Promise<SignipediaSymbolDetail | null> {
    await this.bootstrap();
    return this.repository.getSymbolDetailBySlug(slug);
  }

  async getSymbolDetailById(symbolId: string): Promise<SignipediaSymbolDetail | null> {
    await this.bootstrap();
    return this.repository.getSymbolDetailById(symbolId);
  }

  async createSymbol(input: SymbolUpsertInput) {
    await this.bootstrap();
    return this.repository.createSymbol(input);
  }

  async updateSymbol(symbolId: string, input: Partial<SymbolUpsertInput>) {
    await this.bootstrap();
    return this.repository.updateSymbol(symbolId, input);
  }

  async deleteSymbol(symbolId: string) {
    await this.bootstrap();
    return this.repository.deleteSymbol(symbolId);
  }

  async setSymbolStatus(symbolId: string, status: SymbolStatus) {
    await this.bootstrap();
    return this.repository.setSymbolStatus(symbolId, status);
  }

  async setAliases(symbolId: string, aliases: string[], language?: string) {
    await this.bootstrap();
    return this.repository.setAliases(symbolId, aliases, language);
  }

  async setTags(symbolId: string, tags: string[], language?: string) {
    await this.bootstrap();
    return this.repository.setTags(symbolId, tags, language);
  }

  async setSynonyms(symbolId: string, synonyms: string[], language?: string) {
    await this.bootstrap();
    return this.repository.setSynonyms(symbolId, synonyms, language);
  }

  async setRelatedSymbols(symbolId: string, related: Array<{ relatedSymbolId: string; relationType?: "related" | "similar" | "historical" | "semantic" }>) {
    await this.bootstrap();
    return this.repository.setRelatedSymbols(symbolId, related);
  }

  async setHistoricalPeriods(symbolId: string, periods: Array<{ label: string; startYear: number | null; endYear: number | null; description: string }>) {
    await this.bootstrap();
    return this.repository.setHistoricalPeriods(symbolId, periods);
  }

  async setSources(symbolId: string, sources: Array<{ title: string; url: string | null; author: string | null; publishedAt: string | null; citation: string | null }>) {
    await this.bootstrap();
    return this.repository.setSources(symbolId, sources);
  }

  async setMedia(symbolId: string, media: Array<{ kind: "image" | "video" | "audio" | "document"; url: string; altText: string | null; credit: string | null; width: number | null; height: number | null; sortOrder: number }>) {
    await this.bootstrap();
    return this.repository.setMedia(symbolId, media);
  }

  async setTranslations(symbolId: string, translations: Array<{ language: string; field: "name" | "meaning" | "history" | "origin" | "currentUses"; value: string }>) {
    await this.bootstrap();
    return this.repository.setTranslations(symbolId, translations);
  }

  async listFavorites(sessionId: string) {
    await this.bootstrap();
    return this.repository.listFavorites(sessionId);
  }

  async toggleFavorite(sessionId: string, symbolId: string) {
    await this.bootstrap();
    return this.repository.toggleFavorite(sessionId, symbolId);
  }

  async removeFavorite(sessionId: string, symbolId: string) {
    await this.bootstrap();
    return this.repository.removeFavorite(sessionId, symbolId);
  }

  async importCatalog(catalog: CatalogExport) {
    await this.bootstrap();
    return this.repository.importCatalog(catalog);
  }
}

let engine: SignipediaEngine | null = null;

export function getSignipediaEngine() {
  if (!engine) {
    engine = new SignipediaEngine();
  }

  return engine;
}
