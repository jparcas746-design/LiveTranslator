"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpenText,
  Check,
  FileUp,
  ImagePlus,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  Upload,
} from "lucide-react";
import { fetchJson } from "@/lib/fetchJson";
import { Button } from "@/components/ui/Button";

type AdminCategory = {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string | null;
  parentId: string | null;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
};

type AdminSymbolHit = {
  score: number;
  symbol: {
    id: string;
    slug: string;
    name: string;
    meaning: string;
    history: string;
    origin: string;
    currentUses: string;
    categoryId: string;
    status: "draft" | "review" | "published" | "archived";
    isFeatured: boolean;
    description: string;
    canonicalGlyph: string;
    language: string;
    createdAt: string;
    updatedAt: string;
  };
  category: AdminCategory | null;
  aliases: string[];
  tags: string[];
};

type AdminSummaryResponse = {
  summary: {
    categories: number;
    symbols: number;
    seededCategories: number;
    seededSymbols: number;
  };
  items: {
    categories: AdminCategory[];
    symbols: AdminSymbolHit[];
  };
};

type SymbolFormState = {
  slug: string;
  name: string;
  canonicalGlyph: string;
  meaning: string;
  history: string;
  origin: string;
  currentUses: string;
  description: string;
  categoryId: string;
  language: string;
  status: "draft" | "review" | "published" | "archived";
  isFeatured: boolean;
  aliasesText: string;
  tagsText: string;
  relatedText: string;
  periodsJson: string;
  sourcesJson: string;
  mediaLines: string;
  translationsJson: string;
};

type CategoryFormState = {
  slug: string;
  name: string;
  description: string;
  icon: string;
  parentId: string;
  orderIndex: string;
};

const EMPTY_SYMBOL_FORM: SymbolFormState = {
  slug: "",
  name: "",
  canonicalGlyph: "",
  meaning: "",
  history: "",
  origin: "",
  currentUses: "",
  description: "",
  categoryId: "",
  language: "es",
  status: "draft",
  isFeatured: false,
  aliasesText: "",
  tagsText: "",
  relatedText: "",
  periodsJson: "[]",
  sourcesJson: "[]",
  mediaLines: "",
  translationsJson: "[]",
};

const EMPTY_CATEGORY_FORM: CategoryFormState = {
  slug: "",
  name: "",
  description: "",
  icon: "",
  parentId: "",
  orderIndex: "0",
};

function splitLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function safeJsonArray<T>(value: string, fallback: T[] = []): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

export default function AdminPage() {
  const [authState, setAuthState] = useState<"checking" | "locked" | "authenticated">("checking");
  const [authInput, setAuthInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<AdminSummaryResponse["summary"] | null>(null);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [symbols, setSymbols] = useState<AdminSymbolHit[]>([]);
  const [query, setQuery] = useState("");
  const [selectedSymbolSlug, setSelectedSymbolSlug] = useState<string | null>(null);
  const [symbolForm, setSymbolForm] = useState<SymbolFormState>(EMPTY_SYMBOL_FORM);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(EMPTY_CATEGORY_FORM);
  const [importJson, setImportJson] = useState("{\n  \"categories\": [],\n  \"symbols\": []\n}");
  const [imageUploadMessage, setImageUploadMessage] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const selectedSymbol = useMemo(
    () => symbols.find((item) => item.symbol.slug === selectedSymbolSlug) || null,
    [symbols, selectedSymbolSlug]
  );

  const filteredSymbols = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return symbols;
    }

    return symbols.filter((entry) => {
      const haystack = [
        entry.symbol.name,
        entry.symbol.slug,
        entry.symbol.meaning,
        entry.symbol.history,
        entry.symbol.origin,
        entry.symbol.currentUses,
        entry.aliases.join(" "),
        entry.tags.join(" "),
        entry.category?.name || "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [query, symbols]);

  const categoryOptions = useMemo(() => categories.slice().sort((left, right) => left.name.localeCompare(right.name, "es")), [categories]);

  const checkSession = useCallback(async () => {
    const result = await fetchJson<{ authenticated: boolean }>("/api/admin/session", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    if (!result.ok || !result.data.authenticated) {
      setAuthState("locked");
      if (!result.ok) {
        setAuthError(result.message || "No se pudo validar la sesión.");
      }
      return false;
    }

    setAuthState("authenticated");
    return true;
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setStatus("Cargando catálogo...");

    const result = await fetchJson<AdminSummaryResponse>("/api/admin", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    if (!result.ok) {
      if (result.status === 401) {
        setAuthState("locked");
      }
      setStatus(result.message || "No se pudo cargar el catálogo");
      setLoading(false);
      return;
    }

    setSummary(result.data.summary);
    setCategories(result.data.items.categories || []);
    setSymbols(result.data.items.symbols || []);
    setStatus(`Catálogo cargado: ${result.data.summary.symbols} símbolos`);
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      await checkSession();
    })();
  }, [checkSession]);

  useEffect(() => {
    if (authState !== "authenticated") {
      return;
    }

    void loadData();
  }, [authState, loadData]);

  useEffect(() => {
    if (selectedSymbol) {
      setSymbolForm({
        slug: selectedSymbol.symbol.slug,
        name: selectedSymbol.symbol.name,
        canonicalGlyph: selectedSymbol.symbol.canonicalGlyph,
        meaning: selectedSymbol.symbol.meaning,
        history: selectedSymbol.symbol.history,
        origin: selectedSymbol.symbol.origin,
        currentUses: selectedSymbol.symbol.currentUses,
        description: selectedSymbol.symbol.description,
        categoryId: selectedSymbol.symbol.categoryId,
        language: selectedSymbol.symbol.language,
        status: selectedSymbol.symbol.status,
        isFeatured: selectedSymbol.symbol.isFeatured,
        aliasesText: selectedSymbol.aliases.join("\n"),
        tagsText: selectedSymbol.tags.join("\n"),
        relatedText: "",
        periodsJson: "[]",
        sourcesJson: "[]",
        mediaLines: "",
        translationsJson: "[]",
      });
      return;
    }

    setSymbolForm(EMPTY_SYMBOL_FORM);
  }, [selectedSymbol]);

  useEffect(() => {
    if (!symbolForm.categoryId && categoryOptions.length > 0) {
      setSymbolForm((current) => ({ ...current, categoryId: categoryOptions[0].slug }));
    }
  }, [categoryOptions, symbolForm.categoryId]);

  const authenticate = useCallback(async () => {
    setAuthError(null);
    setStatus("Validando credenciales...");

    const result = await fetchJson<{ authenticated: boolean }>("/api/admin/session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: authInput }),
    });

    if (!result.ok) {
      setAuthError(result.message || "Credenciales inválidas");
      setStatus("Acceso denegado");
      return;
    }

    setAuthInput("");
    setAuthState("authenticated");
    setStatus("Sesión iniciada");
  }, [authInput]);

  const logout = useCallback(async () => {
    await fetchJson("/api/admin/session", {
      method: "DELETE",
      credentials: "include",
    });

    setAuthState("locked");
    setSymbols([]);
    setCategories([]);
    setSummary(null);
    setStatus("Sesión cerrada");
  }, []);

  const saveSymbol = useCallback(async () => {
    const payload = {
      ...symbolForm,
      aliases: splitLines(symbolForm.aliasesText),
      tags: splitLines(symbolForm.tagsText),
      relatedSymbols: splitLines(symbolForm.relatedText).map((item) => ({ relatedSymbolId: item })),
      historicalPeriods: safeJsonArray(symbolForm.periodsJson),
      sources: safeJsonArray(symbolForm.sourcesJson),
      media: splitLines(symbolForm.mediaLines),
      translations: safeJsonArray(symbolForm.translationsJson),
    };

    const endpoint = selectedSymbol ? `/api/symbols/${selectedSymbol.symbol.slug}` : "/api/symbols";
    const method = selectedSymbol ? "PATCH" : "POST";

    setStatus(selectedSymbol ? "Guardando símbolo..." : "Creando símbolo...");
    const result = await fetchJson(endpoint, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!result.ok) {
      setStatus(result.message || "No se pudo guardar el símbolo");
      return;
    }

    setSelectedSymbolSlug(payload.slug);
    await loadData();
    setStatus(selectedSymbol ? "Símbolo actualizado" : "Símbolo creado");
  }, [loadData, selectedSymbol, symbolForm]);

  const deleteSymbol = useCallback(async () => {
    if (!selectedSymbol) {
      return;
    }

    setStatus("Eliminando símbolo...");
    const result = await fetchJson(`/api/symbols/${selectedSymbol.symbol.slug}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!result.ok) {
      setStatus(result.message || "No se pudo eliminar el símbolo");
      return;
    }

    setSelectedSymbolSlug(null);
    await loadData();
    setStatus("Símbolo eliminado");
  }, [loadData, selectedSymbol]);

  const saveCategory = useCallback(async () => {
    setStatus(categoryForm.slug ? "Guardando categoría..." : "Creando categoría...");
    const result = await fetchJson("/api/categories", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: categoryForm.slug,
        name: categoryForm.name,
        description: categoryForm.description,
        icon: categoryForm.icon || null,
        parentId: categoryForm.parentId || null,
        orderIndex: Number(categoryForm.orderIndex) || 0,
      }),
    });

    if (!result.ok) {
      setStatus(result.message || "No se pudo guardar la categoría");
      return;
    }

    await loadData();
    setStatus("Categoría guardada");
  }, [categoryForm, loadData]);

  const deleteCategory = useCallback(async (category: AdminCategory) => {
    setStatus("Eliminando categoría...");
    const result = await fetchJson(`/api/categories/${category.slug}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!result.ok) {
      setStatus(result.message || "No se pudo eliminar la categoría");
      return;
    }

    await loadData();
    setStatus("Categoría eliminada");
  }, [loadData]);

  const importCatalog = useCallback(async () => {
    try {
      const payload = JSON.parse(importJson) as Record<string, unknown>;
      setStatus("Importando catálogo...");
      const result = await fetchJson("/api/admin", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!result.ok) {
        setStatus(result.message || "No se pudo importar");
        return;
      }

      await loadData();
      setStatus("Importación completada");
    } catch {
      setStatus("JSON de importación inválido");
    }
  }, [importJson, loadData]);

  const uploadMedia = useCallback(async (file: File | null) => {
    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.set("file", file);

    setStatus("Subiendo imagen...");
    const result = await fetchJson<{ url: string; fileName: string }>("/api/admin/media", {
      method: "POST",
      credentials: "include",
      body: formData,
    });

    if (!result.ok) {
      setStatus(result.message || "No se pudo subir la imagen");
      return;
    }

    setSymbolForm((current) => ({
      ...current,
      mediaLines: [current.mediaLines.trim(), result.data.url].filter(Boolean).join("\n"),
    }));
    setImageUploadMessage(`Imagen subida: ${result.data.url}`);
    setStatus("Imagen lista para asociar al símbolo");
  }, []);

  const newSymbol = useCallback(() => {
    setSelectedSymbolSlug(null);
    setSymbolForm((current) => ({ ...EMPTY_SYMBOL_FORM, categoryId: current.categoryId || categoryOptions[0]?.slug || "" }));
  }, [categoryOptions]);

  const newCategory = useCallback(() => {
    setCategoryForm(EMPTY_CATEGORY_FORM);
  }, []);

  const loadSymbolFromList = useCallback((symbol: AdminSymbolHit) => {
    setSelectedSymbolSlug(symbol.symbol.slug);
  }, []);

  if (authState === "checking") {
    return (
      <main className="min-h-screen bg-thor-bg text-thor-text admin-grid-bg flex items-center justify-center p-4">
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
          <div className="flex items-center gap-3 text-thor-muted">
            <Loader2 size={18} className="animate-spin" />
            <p className="text-sm">Validando sesión de administrador...</p>
          </div>
        </div>
      </main>
    );
  }

  if (authState === "locked") {
    return (
      <main className="min-h-screen bg-thor-bg text-thor-text admin-grid-bg flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-indigo-500/20 p-2 text-indigo-300">
              <Shield size={22} />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Acceso Signipedia</h2>
              <p className="text-sm text-thor-muted">Introduce la contraseña del panel.</p>
            </div>
          </div>

          <label className="mb-3 block text-sm text-thor-muted">
            Contraseña
            <input
              type="password"
              value={authInput}
              onChange={(event) => setAuthInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void authenticate();
                }
              }}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-thor-text outline-none ring-0 focus:border-indigo-400"
              placeholder="••••••••••••"
            />
          </label>

          {authError ? <p className="mb-3 text-sm text-rose-300">{authError}</p> : null}

          <button
            type="button"
            onClick={() => {
              void authenticate();
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 font-medium text-white transition hover:bg-indigo-400"
          >
            <Lock size={16} />
            Entrar al panel
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-thor-bg text-thor-text admin-grid-bg">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] || null;
          void uploadMedia(file);
          event.currentTarget.value = "";
        }}
      />

      <div className="mx-auto w-full max-w-7xl p-4 md:p-8">
        <header className="mb-6 rounded-2xl border border-slate-700/70 bg-slate-900/90 p-5 shadow-xl backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-wider text-cyan-200">
                <BookOpenText size={14} />
                Signipedia Admin
              </div>
              <h1 className="text-2xl font-bold md:text-3xl">Panel editorial y de catálogo</h1>
              <p className="text-sm text-thor-muted">Símbolos, categorías, medios, relaciones e importación masiva.</p>
            </div>

            <div className="flex items-center gap-2">
              <Link href="/" className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700">
                <ArrowLeft size={16} />
                Volver al índice
              </Link>
              <button
                type="button"
                onClick={() => {
                  void loadData();
                }}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700 disabled:opacity-60"
              >
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                Actualizar
              </button>
              <button
                type="button"
                onClick={() => {
                  void logout();
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200 hover:bg-rose-500/20"
              >
                <Lock size={16} />
                Cerrar sesión
              </button>
            </div>
          </div>
        </header>

        <section className="mb-6 grid gap-4 md:grid-cols-4">
          <article className="rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-lg">
            <div className="text-sm text-thor-muted">Símbolos</div>
            <div className="mt-2 text-3xl font-bold">{summary?.symbols ?? 0}</div>
            <div className="mt-2 text-xs text-thor-muted">Seed: {summary?.seededSymbols ?? 0}</div>
          </article>
          <article className="rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-lg">
            <div className="text-sm text-thor-muted">Categorías</div>
            <div className="mt-2 text-3xl font-bold">{summary?.categories ?? 0}</div>
            <div className="mt-2 text-xs text-thor-muted">Seed: {summary?.seededCategories ?? 0}</div>
          </article>
          <article className="rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-lg md:col-span-2">
            <div className="text-sm text-thor-muted">Estado</div>
            <div className="mt-2 flex items-center gap-2 text-sm text-thor-muted">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {status}
            </div>
            {imageUploadMessage ? <div className="mt-2 text-xs text-cyan-200">{imageUploadMessage}</div> : null}
          </article>
        </section>

        <section className="mb-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-lg">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm text-thor-muted">Símbolos</div>
                <h2 className="text-lg font-semibold">Crear y editar</h2>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={newSymbol} className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700">
                  <Plus size={16} />
                  Nuevo
                </button>
                <button type="button" onClick={() => imageInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-500/20">
                  <ImagePlus size={16} />
                  Subir imagen
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-thor-muted">
                Slug
                <input className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-thor-text outline-none focus:border-cyan-400" value={symbolForm.slug} onChange={(event) => setSymbolForm((current) => ({ ...current, slug: event.target.value }))} />
              </label>
              <label className="grid gap-2 text-sm text-thor-muted">
                Nombre
                <input className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-thor-text outline-none focus:border-cyan-400" value={symbolForm.name} onChange={(event) => setSymbolForm((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label className="grid gap-2 text-sm text-thor-muted md:col-span-2">
                Símbolo / glyph
                <input className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-thor-text outline-none focus:border-cyan-400" value={symbolForm.canonicalGlyph} onChange={(event) => setSymbolForm((current) => ({ ...current, canonicalGlyph: event.target.value }))} />
              </label>
              <label className="grid gap-2 text-sm text-thor-muted md:col-span-2">
                Significado
                <textarea className="min-h-24 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-thor-text outline-none focus:border-cyan-400" value={symbolForm.meaning} onChange={(event) => setSymbolForm((current) => ({ ...current, meaning: event.target.value }))} />
              </label>
              <label className="grid gap-2 text-sm text-thor-muted md:col-span-2">
                Historia
                <textarea className="min-h-24 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-thor-text outline-none focus:border-cyan-400" value={symbolForm.history} onChange={(event) => setSymbolForm((current) => ({ ...current, history: event.target.value }))} />
              </label>
              <label className="grid gap-2 text-sm text-thor-muted md:col-span-2">
                Origen
                <textarea className="min-h-20 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-thor-text outline-none focus:border-cyan-400" value={symbolForm.origin} onChange={(event) => setSymbolForm((current) => ({ ...current, origin: event.target.value }))} />
              </label>
              <label className="grid gap-2 text-sm text-thor-muted md:col-span-2">
                Usos actuales
                <textarea className="min-h-20 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-thor-text outline-none focus:border-cyan-400" value={symbolForm.currentUses} onChange={(event) => setSymbolForm((current) => ({ ...current, currentUses: event.target.value }))} />
              </label>
              <label className="grid gap-2 text-sm text-thor-muted md:col-span-2">
                Descripción SEO
                <textarea className="min-h-20 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-thor-text outline-none focus:border-cyan-400" value={symbolForm.description} onChange={(event) => setSymbolForm((current) => ({ ...current, description: event.target.value }))} />
              </label>
              <label className="grid gap-2 text-sm text-thor-muted">
                Categoría
                <select className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-thor-text outline-none focus:border-cyan-400" value={symbolForm.categoryId} onChange={(event) => setSymbolForm((current) => ({ ...current, categoryId: event.target.value }))}>
                  {categoryOptions.map((category) => (
                    <option key={category.id} value={category.slug}>{category.name}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm text-thor-muted">
                Idioma
                <input className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-thor-text outline-none focus:border-cyan-400" value={symbolForm.language} onChange={(event) => setSymbolForm((current) => ({ ...current, language: event.target.value }))} />
              </label>
              <label className="grid gap-2 text-sm text-thor-muted">
                Estado
                <select className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-thor-text outline-none focus:border-cyan-400" value={symbolForm.status} onChange={(event) => setSymbolForm((current) => ({ ...current, status: event.target.value as SymbolFormState["status"] }))}>
                  <option value="draft">draft</option>
                  <option value="review">review</option>
                  <option value="published">published</option>
                  <option value="archived">archived</option>
                </select>
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-thor-muted md:col-span-2">
                <input type="checkbox" checked={symbolForm.isFeatured} onChange={(event) => setSymbolForm((current) => ({ ...current, isFeatured: event.target.checked }))} />
                Destacado editorial
              </label>
              <label className="grid gap-2 text-sm text-thor-muted md:col-span-2">
                Alias por línea
                <textarea className="min-h-20 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-thor-text outline-none focus:border-cyan-400" value={symbolForm.aliasesText} onChange={(event) => setSymbolForm((current) => ({ ...current, aliasesText: event.target.value }))} placeholder="sigma&#10;sumatoria" />
              </label>
              <label className="grid gap-2 text-sm text-thor-muted md:col-span-2">
                Etiquetas por línea
                <textarea className="min-h-20 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-thor-text outline-none focus:border-cyan-400" value={symbolForm.tagsText} onChange={(event) => setSymbolForm((current) => ({ ...current, tagsText: event.target.value }))} placeholder="matemática&#10;serie" />
              </label>
              <label className="grid gap-2 text-sm text-thor-muted md:col-span-2">
                Relacionados por slug, uno por línea
                <textarea className="min-h-20 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-thor-text outline-none focus:border-cyan-400" value={symbolForm.relatedText} onChange={(event) => setSymbolForm((current) => ({ ...current, relatedText: event.target.value }))} placeholder="infinito&#10;pi" />
              </label>
              <label className="grid gap-2 text-sm text-thor-muted md:col-span-2">
                Medios / URLs por línea
                <textarea className="min-h-20 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-thor-text outline-none focus:border-cyan-400" value={symbolForm.mediaLines} onChange={(event) => setSymbolForm((current) => ({ ...current, mediaLines: event.target.value }))} placeholder="/signipedia-media/symbol.png" />
              </label>
              <label className="grid gap-2 text-sm text-thor-muted md:col-span-2">
                Periodos históricos JSON
                <textarea className="min-h-24 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-thor-text outline-none focus:border-cyan-400" value={symbolForm.periodsJson} onChange={(event) => setSymbolForm((current) => ({ ...current, periodsJson: event.target.value }))} />
              </label>
              <label className="grid gap-2 text-sm text-thor-muted md:col-span-2">
                Fuentes JSON
                <textarea className="min-h-24 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-thor-text outline-none focus:border-cyan-400" value={symbolForm.sourcesJson} onChange={(event) => setSymbolForm((current) => ({ ...current, sourcesJson: event.target.value }))} />
              </label>
              <label className="grid gap-2 text-sm text-thor-muted md:col-span-2">
                Traducciones JSON
                <textarea className="min-h-24 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-thor-text outline-none focus:border-cyan-400" value={symbolForm.translationsJson} onChange={(event) => setSymbolForm((current) => ({ ...current, translationsJson: event.target.value }))} />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button type="button" variant="primary" onClick={() => void saveSymbol()} leftIcon={<Upload size={16} />}>
                Guardar símbolo
              </Button>
              <Button type="button" variant="secondary" onClick={newSymbol} leftIcon={<Plus size={16} />}>
                Nuevo símbolo
              </Button>
              <Button type="button" variant="danger" onClick={() => void deleteSymbol()} leftIcon={<Trash2 size={16} />} disabled={!selectedSymbol}>
                Eliminar símbolo
              </Button>
            </div>
          </article>

          <aside className="grid gap-6">
            <article className="rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-lg">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-thor-muted">Importación</div>
                  <h2 className="text-lg font-semibold">JSON / CSV</h2>
                </div>
                <Button type="button" variant="secondary" onClick={() => void importCatalog()} leftIcon={<FileUp size={16} />}>
                  Importar
                </Button>
              </div>
              <textarea
                className="min-h-72 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-thor-text outline-none focus:border-cyan-400"
                value={importJson}
                onChange={(event) => setImportJson(event.target.value)}
              />
            </article>

            <article className="rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-lg">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-thor-muted">Categorías</div>
                  <h2 className="text-lg font-semibold">Gestionar taxonomía</h2>
                </div>
                <Button type="button" variant="secondary" onClick={newCategory} leftIcon={<Plus size={16} />}>
                  Nueva
                </Button>
              </div>

              <div className="grid gap-3">
                <input className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-thor-text outline-none focus:border-cyan-400" value={categoryForm.slug} onChange={(event) => setCategoryForm((current) => ({ ...current, slug: event.target.value }))} placeholder="slug" />
                <input className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-thor-text outline-none focus:border-cyan-400" value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nombre" />
                <textarea className="min-h-24 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-thor-text outline-none focus:border-cyan-400" value={categoryForm.description} onChange={(event) => setCategoryForm((current) => ({ ...current, description: event.target.value }))} placeholder="Descripción" />
                <input className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-thor-text outline-none focus:border-cyan-400" value={categoryForm.icon} onChange={(event) => setCategoryForm((current) => ({ ...current, icon: event.target.value }))} placeholder="Icono" />
                <input className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-thor-text outline-none focus:border-cyan-400" value={categoryForm.parentId} onChange={(event) => setCategoryForm((current) => ({ ...current, parentId: event.target.value }))} placeholder="Parent slug" />
                <input className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-thor-text outline-none focus:border-cyan-400" value={categoryForm.orderIndex} onChange={(event) => setCategoryForm((current) => ({ ...current, orderIndex: event.target.value }))} placeholder="Orden" />
              </div>

              <div className="mt-4 flex gap-2">
                <Button type="button" variant="primary" onClick={() => void saveCategory()} leftIcon={<Upload size={16} />}>
                  Guardar categoría
                </Button>
              </div>

              <div className="mt-5 grid gap-2">
                {categories.map((category) => (
                  <div key={category.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
                    <button
                      type="button"
                      className="text-left"
                      onClick={() =>
                        setCategoryForm({
                          slug: category.slug,
                          name: category.name,
                          description: category.description,
                          icon: category.icon || "",
                          parentId: category.parentId || "",
                          orderIndex: String(category.orderIndex),
                        })
                      }
                    >
                      <strong className="block text-thor-text">{category.name}</strong>
                      <span className="text-xs text-thor-muted">{category.slug}</span>
                    </button>
                    <button type="button" onClick={() => void deleteCategory(category)} className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/20">
                      Eliminar
                    </button>
                  </div>
                ))}
              </div>
            </article>
          </aside>
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-lg">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 text-sm text-thor-muted">
              <Search size={16} />
              Buscar símbolos
            </div>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="ml-auto w-full max-w-lg rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-400"
              placeholder="Buscar por nombre, alias, etiqueta o descripción..."
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredSymbols.map((entry) => (
              <button
                key={entry.symbol.id}
                type="button"
                onClick={() => loadSymbolFromList(entry)}
                className={`rounded-2xl border p-4 text-left transition hover:bg-slate-800/40 ${selectedSymbolSlug === entry.symbol.slug ? "border-cyan-400 bg-cyan-500/10" : "border-slate-700 bg-slate-950"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-2xl font-semibold">{entry.symbol.canonicalGlyph || "∎"}</div>
                    <h3 className="mt-2 text-base font-semibold text-thor-text">{entry.symbol.name}</h3>
                    <p className="mt-1 text-xs text-thor-muted">{entry.symbol.slug}</p>
                  </div>
                  <span className="rounded-full border border-slate-700 px-2 py-1 text-[11px] uppercase tracking-wider text-thor-muted">{entry.symbol.status}</span>
                </div>
                <p className="mt-3 line-clamp-3 text-sm text-thor-muted">{entry.symbol.meaning}</p>
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
