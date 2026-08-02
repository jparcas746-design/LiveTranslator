"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Bookmark, BookOpenText, Search, Sparkles, Star, SunMoon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ToastViewport } from "@/components/ui/ToastViewport";
import { useTheme } from "@/hooks/useTheme";
import { useToast } from "@/hooks/useToast";
import type { SearchHit, SignipediaCatalogStats, SignipediaCategory } from "@/thor/signipedia/types";

const FAVORITES_KEY = "signipedia-favorites";

type SortMode = "featured" | "name" | "category";

type SignipediaHomeProps = {
  categories: SignipediaCategory[];
  initialResults: SearchHit[];
  featured: SearchHit[];
  stats: SignipediaCatalogStats;
};

function symbolAccent(categorySlug?: string) {
  switch (categorySlug) {
    case "mathematics":
      return "math";
    case "chemistry":
      return "chemistry";
    case "biology":
      return "biology";
    case "religion":
      return "religion";
    case "astronomy":
      return "astronomy";
    case "currency":
      return "currency";
    case "computing":
      return "computing";
    case "traffic":
      return "traffic";
    case "heraldry":
      return "heraldry";
    case "alchemy":
      return "alchemy";
    case "runes":
      return "runes";
    default:
      return "math";
  }
}

function sortResults(results: SearchHit[], sortMode: SortMode) {
  const sorted = [...results];

  if (sortMode === "name") {
    return sorted.sort((left, right) => left.symbol.name.localeCompare(right.symbol.name, "es"));
  }

  if (sortMode === "category") {
    return sorted.sort((left, right) => {
      const leftCategory = left.category?.name || "";
      const rightCategory = right.category?.name || "";
      return leftCategory.localeCompare(rightCategory, "es") || left.symbol.name.localeCompare(right.symbol.name, "es");
    });
  }

  return sorted.sort((left, right) => right.score - left.score || Number(right.symbol.isFeatured) - Number(left.symbol.isFeatured) || left.symbol.name.localeCompare(right.symbol.name, "es"));
}

function buildQueryUrl(query: string, categorySlug: string) {
  const params = new URLSearchParams();

  if (query.trim()) {
    params.set("q", query.trim());
  }

  if (categorySlug !== "all") {
    params.set("category", categorySlug);
  }

  params.set("language", "es");
  params.set("limit", "48");
  params.set("offset", "0");

  return `/api/search?${params.toString()}`;
}

export function SignipediaHome({ categories, initialResults, featured, stats }: SignipediaHomeProps) {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortMode, setSortMode] = useState<SortMode>("featured");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const [remoteResults, setRemoteResults] = useState<SearchHit[]>(initialResults);
  const [remoteTotal, setRemoteTotal] = useState(initialResults.length);
  const [isLoading, setIsLoading] = useState(false);
  const { theme, mounted: themeMounted, toggleTheme } = useTheme();
  const { toasts, removeToast, showToast } = useToast();

  useEffect(() => {
    setMounted(true);

    try {
      const raw = window.localStorage.getItem(FAVORITES_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setFavorites(parsed.filter((item) => typeof item === "string"));
      }
    } catch {
      setFavorites([]);
    }
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites.slice(0, 48)));
  }, [favorites, mounted]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await fetch(buildQueryUrl(query, selectedCategory), { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Search request failed with ${response.status}`);
        }

        const payload = (await response.json()) as { items?: SearchHit[]; total?: number };
        setRemoteResults(Array.isArray(payload.items) ? payload.items : []);
        setRemoteTotal(Number.isFinite(payload.total) ? Number(payload.total) : 0);
      } catch (error) {
        if ((error as { name?: string }).name !== "AbortError") {
          setRemoteResults([]);
          setRemoteTotal(0);
        }
      } finally {
        setIsLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, selectedCategory]);

  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const currentResults = useMemo(() => sortResults(remoteResults.length > 0 || query.trim() || selectedCategory !== "all" ? remoteResults : initialResults, sortMode), [initialResults, query, remoteResults, selectedCategory, sortMode]);
  const spotlight = currentResults[0] || featured[0] || initialResults[0] || null;

  const favoriteSymbols = useMemo(() => {
    const lookup = new Map<string, SearchHit["symbol"]>();
    for (const hit of [...currentResults, ...featured, ...initialResults]) {
      lookup.set(hit.symbol.slug, hit.symbol);
    }

    return favorites.map((slug) => lookup.get(slug)).filter(Boolean) as SearchHit["symbol"][];
  }, [currentResults, featured, favorites, initialResults]);

  function toggleFavorite(symbolSlug: string, symbolName: string) {
    setFavorites((prev) => {
      if (prev.includes(symbolSlug)) {
        showToast("info", "Favorito eliminado", symbolName);
        return prev.filter((slug) => slug !== symbolSlug);
      }

      showToast("success", "Guardado en favoritos", symbolName);
      return [symbolSlug, ...prev].slice(0, 48);
    });
  }

  function clearFilters() {
    setQuery("");
    setSelectedCategory("all");
    setSortMode("featured");
  }

  return (
    <>
      <ToastViewport toasts={toasts} onDismiss={removeToast} />

      <main className="signipedia-shell">
        <section className="signipedia-hero">
          <div className="signipedia-hero-copy">
            <div className="signipedia-badge">
              <BookOpenText size={14} />
              Enciclopedia viva de símbolos
            </div>
            <h1>Signipedia</h1>
            <p className="signipedia-lead">
              La referencia para descubrir el significado, origen, historia y usos actuales de cualquier símbolo.
            </p>

            <div className="signipedia-searchbar" role="search">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Busca por nombre, alias, descripción o contexto"
                aria-label="Buscar símbolos"
              />
              {query.trim() ? (
                <button type="button" className="signipedia-clear" onClick={() => setQuery("")}>Limpiar</button>
              ) : null}
            </div>

            <div className="signipedia-hero-actions">
              <Button type="button" variant="primary" size="lg" leftIcon={<Sparkles size={16} />} onClick={clearFilters}>
                Explorar catálogo
              </Button>
              <Button type="button" variant="secondary" size="lg" leftIcon={<SunMoon size={16} />} onClick={toggleTheme}>
                {themeMounted && theme === "dark" ? "Modo claro" : "Modo oscuro"}
              </Button>
            </div>

            <div className="signipedia-stats" aria-label="Resumen del catálogo">
              <article>
                <strong>{stats.symbolCount}</strong>
                <span>Símbolos</span>
              </article>
              <article>
                <strong>{stats.categoryCount}</strong>
                <span>Categorías</span>
              </article>
              <article>
                <strong>{stats.synonymCount}</strong>
                <span>Sinónimos</span>
              </article>
            </div>
          </div>

          <aside className="signipedia-hero-panel">
            <div className="signipedia-hero-panel-head">
              <span>Ficha destacada</span>
              <Star size={16} aria-hidden="true" />
            </div>

            {spotlight ? (
              <>
                <div className={`signipedia-glyph signipedia-glyph-${symbolAccent(spotlight.category?.slug)}`}>
                  {spotlight.symbol.canonicalGlyph}
                </div>
                <h2>{spotlight.symbol.name}</h2>
                <p>{spotlight.symbol.meaning}</p>
                <div className="signipedia-inline-meta">
                  <span>{spotlight.category?.name}</span>
                  <span>{spotlight.symbol.origin}</span>
                </div>
                <div className="signipedia-hero-panel-actions">
                  <Link href={`/symbols/${spotlight.symbol.slug}`} className="btn btn-primary btn-md">
                    Ver ficha completa
                  </Link>
                  <button type="button" className="signipedia-icon-button" onClick={() => toggleFavorite(spotlight.symbol.slug, spotlight.symbol.name)}>
                    <Bookmark size={16} />
                  </button>
                </div>
              </>
            ) : null}
          </aside>
        </section>

        <section className="signipedia-filter-rail">
          <div className="signipedia-filter-group">
            <span className="signipedia-section-label">Categorías</span>
            <div className="signipedia-chip-list">
              <button
                type="button"
                className={`signipedia-chip ${selectedCategory === "all" ? "is-active" : ""}`}
                onClick={() => setSelectedCategory("all")}
              >
                Todas
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={`signipedia-chip ${selectedCategory === category.id ? "is-active" : ""}`}
                  onClick={() => setSelectedCategory(category.id)}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>

          <div className="signipedia-filter-group signipedia-advanced-filters">
            <label>
              Orden
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                <option value="featured">Destacados</option>
                <option value="name">Nombre</option>
                <option value="category">Categoría</option>
              </select>
            </label>
            <div className="signipedia-filter-help">
              {isLoading ? "Buscando..." : (
                <>
                  Búsqueda activa: <strong>{remoteTotal}</strong> coincidencias
                </>
              )}
            </div>
          </div>
        </section>

        <section className="signipedia-grid-layout">
          <div className="signipedia-main-column">
            <div className="signipedia-section-head">
              <div>
                <span className="signipedia-section-label">Explorar</span>
                <h2>Resultados del catálogo</h2>
              </div>
              <button type="button" className="signipedia-text-button" onClick={clearFilters}>
                Restablecer filtros
              </button>
            </div>

            <div className="signipedia-grid">
              {currentResults.map((hit) => {
                const isFavorite = favorites.includes(hit.symbol.slug);
                return (
                  <article key={hit.symbol.slug} className="signipedia-card">
                    <div className="signipedia-card-topline">
                      <span className="signipedia-tag">{hit.category?.name || "Sin categoría"}</span>
                      <button type="button" className="signipedia-icon-button" onClick={() => toggleFavorite(hit.symbol.slug, hit.symbol.name)}>
                        <Bookmark size={16} fill={isFavorite ? "currentColor" : "none"} />
                      </button>
                    </div>
                    <div className={`signipedia-card-glyph signipedia-glyph-${symbolAccent(hit.category?.slug)}`}>
                      {hit.symbol.canonicalGlyph}
                    </div>
                    <h3>{hit.symbol.name}</h3>
                    <p>{hit.symbol.meaning}</p>
                    <div className="signipedia-card-meta">
                      <span>{hit.symbol.origin}</span>
                      <span>{hit.symbol.currentUses}</span>
                    </div>
                    <div className="signipedia-card-actions">
                      <Link href={`/symbols/${hit.symbol.slug}`} className="btn btn-secondary btn-sm">
                        Abrir ficha
                        <ArrowRight size={14} />
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <aside className="signipedia-side-column">
            <section className="signipedia-panel">
              <div className="signipedia-section-head compact">
                <div>
                  <span className="signipedia-section-label">Favoritos</span>
                  <h2>Guardados</h2>
                </div>
              </div>

              {mounted && favoriteSymbols.length > 0 ? (
                <div className="signipedia-favorite-list">
                  {favoriteSymbols.slice(0, 6).map((symbol) => (
                    <Link key={symbol.slug} href={`/symbols/${symbol.slug}`} className="signipedia-favorite-item">
                      <span>{symbol.canonicalGlyph}</span>
                      <div>
                        <strong>{symbol.name}</strong>
                        <small>{categoryById.get(symbol.categoryId)?.name}</small>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="signipedia-muted">
                  Tus favoritos aparecerán aquí para volver a consultarlos con un clic.
                </p>
              )}
            </section>

            <section className="signipedia-panel">
              <div className="signipedia-section-head compact">
                <div>
                  <span className="signipedia-section-label">Arquitectura</span>
                  <h2>Preparado para crecer</h2>
                </div>
              </div>
              <ul className="signipedia-timeline">
                <li>Catálogo y filtros servidos desde PostgreSQL.</li>
                <li>Búsqueda por nombre, alias, descripción, categoría y etiquetas con relevancia ordenada.</li>
                <li>Base lista para importar miles de símbolos con formato estándar.</li>
                <li>Espacio reservado para OCR, cámara, dibujo y comparador de símbolos.</li>
              </ul>
            </section>

            <section className="signipedia-panel signipedia-panel-soft">
              <span className="signipedia-section-label">Criterio editorial</span>
              <p>
                Signipedia prioriza claridad, contexto histórico y uso contemporaneo. El objetivo no es solo identificar un signo,
                sino explicarlo como objeto cultural.
              </p>
            </section>
          </aside>
        </section>

        <section className="signipedia-feature-strip">
          {featured.slice(0, 3).map((hit) => (
            <article key={hit.symbol.slug} className="signipedia-feature-card">
              <div className="signipedia-card-topline">
                <span className="signipedia-tag">{hit.category?.name || "General"}</span>
                <span className="signipedia-mini-note">Sinónimos: {hit.symbol.synonyms.length}</span>
              </div>
              <div className={`signipedia-card-glyph signipedia-glyph-${symbolAccent(hit.category?.slug)}`}>
                {hit.symbol.canonicalGlyph}
              </div>
              <h3>{hit.symbol.name}</h3>
              <p>{hit.symbol.currentUses}</p>
              <div className="signipedia-inline-meta">
                <span>{hit.aliases.slice(0, 2).join(" · ")}</span>
                <span>{hit.symbol.synonyms.slice(0, 2).join(" · ")}</span>
              </div>
            </article>
          ))}
        </section>
      </main>
    </>
  );
}
