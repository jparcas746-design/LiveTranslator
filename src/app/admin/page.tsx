"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpenText,
  Check,
  Eye,
  EyeOff,
  FileUp,
  FileText,
  Globe,
  ImagePlus,
  Images,
  Link2,
  Loader2,
  Lock,
  PenSquare,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Shield,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { fetchJson } from "@/lib/fetchJson";
import { Button } from "@/components/ui/Button";
import { normalizeL2, VISION_EMBEDDING_DIMENSIONS } from "@/thor/signipedia/recognition/vectorMath";
import { CLIP_VISION_MODEL_ID } from "@/thor/signipedia/recognition/clipConfig";

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
    variants: string[];
    curiosities: string[];
    synonyms: string[];
    categoryId: string;
    status: "draft" | "review" | "published" | "archived";
    isFeatured: boolean;
    description: string;
    canonicalGlyph: string;
    imageUrl?: string | null;
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
  variantsText: string;
  curiositiesText: string;
  aliasesText: string;
  synonymsText: string;
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

type VisionEmbeddingQueueItem = {
  symbolId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  status: "pending" | "up-to-date" | "missing-image";
  reason: string;
  currentDimensions: number | null;
  currentSource: string | null;
  needsBackfill: boolean;
};

type VisionEmbeddingQueueResponse = {
  totals: {
    symbolsTotal: number;
    withImage: number;
    missingImage: number;
    valid512: number;
    pending: number;
  };
  queue: VisionEmbeddingQueueItem[];
  pending: VisionEmbeddingQueueItem[];
};

type VisionBackfillProgress = {
  current: number;
  total: number;
  success: number;
  skipped: number;
  failed: number;
  currentSlug: string;
};

type ClipRuntime = {
  modelId: string;
  processor: (input: unknown) => Promise<Record<string, unknown>>;
  model: (inputs: Record<string, unknown>) => Promise<Record<string, unknown>>;
  RawImage: {
    fromBlob: (blob: Blob) => Promise<unknown>;
  };
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
  variantsText: "",
  curiositiesText: "",
  aliasesText: "",
  synonymsText: "",
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
  const router = useRouter();
  const [authState, setAuthState] = useState<"checking" | "locked" | "authenticated">("checking");
  const [authInput, setAuthInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
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
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState<VisionBackfillProgress | null>(null);
  const [backfillLogs, setBackfillLogs] = useState<string[]>([]);
  const [backfillTotals, setBackfillTotals] = useState<VisionEmbeddingQueueResponse["totals"] | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const clipRuntimeRef = useRef<ClipRuntime | null>(null);
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
      router.replace("/admin/login");
      if (!result.ok) {
        setAuthError(result.message || "No se pudo validar la sesión.");
      }
      return false;
    }

    setAuthState("authenticated");
    return true;
  }, [router]);

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
        router.replace("/admin/login");
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
  }, [router]);

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
        categoryId: selectedSymbol.category?.slug || selectedSymbol.symbol.categoryId,
        language: selectedSymbol.symbol.language,
        status: selectedSymbol.symbol.status,
        isFeatured: selectedSymbol.symbol.isFeatured,
        variantsText: (selectedSymbol.symbol.variants || []).join("\n"),
        curiositiesText: (selectedSymbol.symbol.curiosities || []).join("\n"),
        aliasesText: selectedSymbol.aliases.join("\n"),
        synonymsText: (selectedSymbol.symbol.synonyms || []).join("\n"),
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
    setIsAuthenticating(true);

    const result = await fetchJson<{ authenticated: boolean }>("/api/admin/session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: authInput }),
    });

    if (!result.ok) {
      setAuthError(result.message || "Credenciales inválidas");
      setStatus("Acceso denegado");
      setIsAuthenticating(false);
      return;
    }

    setAuthInput("");
    setAuthState("authenticated");
    setStatus("Sesión iniciada");
    setIsAuthenticating(false);
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
    router.push("/");
  }, [router]);

  const saveSymbol = useCallback(async () => {
    const payload = {
      ...symbolForm,
      variants: splitLines(symbolForm.variantsText),
      curiosities: splitLines(symbolForm.curiositiesText),
      aliases: splitLines(symbolForm.aliasesText),
      synonyms: splitLines(symbolForm.synonymsText),
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

  const pushBackfillLog = useCallback((line: string) => {
    setBackfillLogs((current) => [`${new Date().toLocaleTimeString()} ${line}`, ...current].slice(0, 80));
  }, []);

  const loadClipRuntime = useCallback(async () => {
    if (clipRuntimeRef.current) {
      return clipRuntimeRef.current;
    }

    const transformers = await import("@huggingface/transformers");
    const { env, AutoProcessor, CLIPVisionModelWithProjection, RawImage } = transformers;

    env.allowLocalModels = false;
    env.useBrowserCache = true;

    const modelId = CLIP_VISION_MODEL_ID;
    const processor = await AutoProcessor.from_pretrained(modelId);
    const model = await CLIPVisionModelWithProjection.from_pretrained(modelId);

    clipRuntimeRef.current = {
      modelId,
      processor: processor as ClipRuntime["processor"],
      model: model as ClipRuntime["model"],
      RawImage: RawImage as ClipRuntime["RawImage"],
    };

    return clipRuntimeRef.current;
  }, []);

  const generateVisionEmbeddings = useCallback(async () => {
    setIsBackfilling(true);
    setBackfillLogs([]);
    setBackfillProgress(null);
    setStatus("Preparando backfill de vision_embedding...");

    const queueResult = await fetchJson<VisionEmbeddingQueueResponse>("/api/admin/vision-embeddings", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    if (!queueResult.ok) {
      setStatus(queueResult.message || "No se pudo cargar la cola de embeddings");
      setIsBackfilling(false);
      return;
    }

    setBackfillTotals(queueResult.data.totals);

    const pending = queueResult.data.pending;
    if (pending.length === 0) {
      setStatus("No hay símbolos pendientes de backfill.");
      pushBackfillLog("No hay elementos pendientes. Todo está actualizado.");
      setIsBackfilling(false);
      return;
    }

    setStatus(`Cargando CLIP para procesar ${pending.length} símbolos...`);

    let runtime: ClipRuntime;
    try {
      runtime = await loadClipRuntime();
      pushBackfillLog(`Modelo CLIP cargado: ${runtime.modelId}`);
    } catch (error) {
      setStatus("No se pudo cargar CLIP para el backfill");
      pushBackfillLog(`ERROR cargando CLIP: ${error instanceof Error ? error.message : String(error)}`);
      setIsBackfilling(false);
      return;
    }

    let success = 0;
    let failed = 0;
    let skipped = 0;

    for (let index = 0; index < pending.length; index += 1) {
      const item = pending[index];
      setBackfillProgress({
        current: index + 1,
        total: pending.length,
        success,
        failed,
        skipped,
        currentSlug: item.slug,
      });

      pushBackfillLog(`Procesando ${item.slug} (${index + 1}/${pending.length})`);

      try {
        if (!item.imageUrl) {
          skipped += 1;
          pushBackfillLog(`SKIP ${item.slug}: sin imagen.`);
          continue;
        }

        const imageResponse = await fetch(item.imageUrl, { cache: "no-store" });
        if (!imageResponse.ok) {
          throw new Error(`No se pudo descargar imagen (${imageResponse.status})`);
        }

        const blob = await imageResponse.blob();
        const rawImage = await runtime.RawImage.fromBlob(blob);
        const processed = await runtime.processor(rawImage);
        const output = await runtime.model(processed);
        const tensor = output.image_embeds as { data?: Float32Array | number[] } | undefined;

        if (!tensor?.data) {
          throw new Error("CLIP no devolvió image_embeds");
        }

        const values = Array.from(tensor.data);
        if (values.length !== VISION_EMBEDDING_DIMENSIONS) {
          throw new Error(`Dimensión inesperada ${values.length}. Se esperaba ${VISION_EMBEDDING_DIMENSIONS}`);
        }

        const normalized = normalizeL2(values);
        if (!normalized) {
          throw new Error("No se pudo normalizar el embedding (norma cero)");
        }

        const saveResult = await fetchJson<{ ok: boolean; skipped: boolean; reason?: string }>("/api/admin/vision-embeddings", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbolId: item.symbolId,
            imageUrl: item.imageUrl,
            embedding: normalized,
          }),
        });

        if (!saveResult.ok) {
          throw new Error(saveResult.message || "No se pudo guardar el embedding");
        }

        if (saveResult.data.skipped) {
          skipped += 1;
          pushBackfillLog(`SKIP ${item.slug}: ${saveResult.data.reason || "up-to-date"}`);
        } else {
          success += 1;
          pushBackfillLog(`OK ${item.slug}: embedding 512 guardado.`);
        }
      } catch (error) {
        failed += 1;
        pushBackfillLog(`ERROR ${item.slug}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const verifyResult = await fetchJson<VisionEmbeddingQueueResponse>("/api/admin/vision-embeddings", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    if (verifyResult.ok) {
      setBackfillTotals(verifyResult.data.totals);
      pushBackfillLog(
        `Verificación: ${verifyResult.data.totals.valid512}/${verifyResult.data.totals.symbolsTotal} símbolos con embedding 512 válido.`
      );
    }

    setBackfillProgress({
      current: pending.length,
      total: pending.length,
      success,
      failed,
      skipped,
      currentSlug: "completado",
    });
    setStatus(`Backfill finalizado. OK=${success}, SKIP=${skipped}, ERR=${failed}`);
    await loadData();
    setIsBackfilling(false);
  }, [loadClipRuntime, loadData, pushBackfillLog]);

  if (authState === "checking") {
    return (
      <main className="admin-auth-shell admin-grid-bg">
        <div className="admin-auth-card admin-auth-loading">
          <div className="admin-auth-badge">Signipedia CMS</div>
          <h1>Comprobando sesión</h1>
          <p>Preparando el entorno editorial y verificando acceso seguro.</p>
          <div className="admin-auth-progress" role="status" aria-live="polite">
            <Loader2 size={18} className="animate-spin" />
            <span>Validando sesión de administrador...</span>
          </div>
        </div>
      </main>
    );
  }

  if (authState === "locked") {
    return (
      <main className="admin-auth-shell admin-grid-bg">
        <div className="admin-auth-card">
          <div className="admin-auth-badge">Acceso editorial</div>
          <div className="admin-auth-head">
            <div className="admin-auth-icon">
              <Shield size={22} />
            </div>
            <div>
              <h1>Panel Signipedia</h1>
              <p>Inicia sesión para gestionar el catálogo, medios y contenido público.</p>
            </div>
          </div>

          <label className="admin-auth-label">
            Contraseña
            <div className="admin-auth-input-wrap">
              <input
                type={showPassword ? "text" : "password"}
                value={authInput}
                onChange={(event) => setAuthInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void authenticate();
                  }
                }}
                className="admin-auth-input"
                placeholder="Introduce tu contraseña"
              />
              <button type="button" className="admin-auth-toggle" onClick={() => setShowPassword((current) => !current)}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                <span>{showPassword ? "Ocultar" : "Mostrar"}</span>
              </button>
            </div>
          </label>

          {authError ? <div className="admin-auth-error">{authError}</div> : null}

          <button
            type="button"
            onClick={() => {
              void authenticate();
            }}
            disabled={isAuthenticating}
            className="admin-auth-submit"
          >
            {isAuthenticating ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
            {isAuthenticating ? "Validando acceso..." : "Entrar al panel"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-cms-root admin-grid-bg">
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

      <div className="admin-cms-container">
        <header className="admin-cms-header admin-enter">
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
                className="admin-top-pill admin-top-pill-neutral inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                Actualizar
              </button>
              <button
                type="button"
                onClick={() => {
                  void logout();
                }}
                className="admin-top-pill admin-top-pill-danger inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold"
              >
                <Lock size={16} />
                Cerrar sesión
              </button>
            </div>
          </div>
        </header>

        <section className="admin-cms-kpis admin-enter">
          <article className="admin-card">
            <div className="text-sm text-thor-muted">Símbolos</div>
            <div className="mt-2 text-3xl font-bold">{summary?.symbols ?? 0}</div>
            <div className="mt-2 text-xs text-thor-muted">Seed: {summary?.seededSymbols ?? 0}</div>
          </article>
          <article className="admin-card">
            <div className="text-sm text-thor-muted">Categorías</div>
            <div className="mt-2 text-3xl font-bold">{summary?.categories ?? 0}</div>
            <div className="mt-2 text-xs text-thor-muted">Seed: {summary?.seededCategories ?? 0}</div>
          </article>
          <article className="admin-card admin-card-wide">
            <div className="text-sm text-thor-muted">Estado</div>
            <div className="mt-2 flex items-center gap-2 text-sm text-thor-muted">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {status}
            </div>
            {imageUploadMessage ? <div className="mt-2 text-xs text-cyan-200">{imageUploadMessage}</div> : null}
          </article>
        </section>

        <section className="admin-cms-main admin-enter">
          <article className="admin-card admin-form-card">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm text-thor-muted">Símbolos</div>
                <h2 className="text-lg font-semibold">Crear y editar</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={newSymbol}
                  className="admin-tool-pill admin-tool-pill-new inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold"
                >
                  <Plus size={16} />
                  Nuevo
                </button>
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="admin-tool-pill admin-tool-pill-upload inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold"
                >
                  <ImagePlus size={16} />
                  Subir imagen
                </button>
              </div>
            </div>

            <div className="admin-editor-layout">
              <section className="admin-editor-section">
                <header className="admin-editor-section-head">
                  <div className="admin-editor-section-icon">
                    <PenSquare size={16} />
                  </div>
                  <div>
                    <h3>Información básica</h3>
                    <p>Identidad principal del símbolo y taxonomía editorial.</p>
                  </div>
                </header>
                <div className="admin-editor-grid">
                  <label className="admin-field">
                    <span className="admin-field-label">Slug</span>
                    <input className="admin-input" value={symbolForm.slug} onChange={(event) => setSymbolForm((current) => ({ ...current, slug: event.target.value }))} placeholder="infinito" />
                  </label>
                  <label className="admin-field">
                    <span className="admin-field-label">Nombre</span>
                    <input className="admin-input" value={symbolForm.name} onChange={(event) => setSymbolForm((current) => ({ ...current, name: event.target.value }))} placeholder="Infinito" />
                  </label>
                  <label className="admin-field">
                    <span className="admin-field-label">Símbolo / Glyph</span>
                    <input className="admin-input" value={symbolForm.canonicalGlyph} onChange={(event) => setSymbolForm((current) => ({ ...current, canonicalGlyph: event.target.value }))} placeholder="∞" />
                  </label>
                  <label className="admin-field">
                    <span className="admin-field-label">Categoría</span>
                    <select className="admin-select" value={symbolForm.categoryId} onChange={(event) => setSymbolForm((current) => ({ ...current, categoryId: event.target.value }))}>
                      {categoryOptions.map((category) => (
                        <option key={category.id} value={category.slug}>{category.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="admin-field">
                    <span className="admin-field-label">Idioma</span>
                    <input className="admin-input" value={symbolForm.language} onChange={(event) => setSymbolForm((current) => ({ ...current, language: event.target.value }))} placeholder="es" />
                  </label>
                  <label className="admin-field">
                    <span className="admin-field-label">Estado</span>
                    <select className="admin-select" value={symbolForm.status} onChange={(event) => setSymbolForm((current) => ({ ...current, status: event.target.value as SymbolFormState["status"] }))}>
                      <option value="draft">draft</option>
                      <option value="review">review</option>
                      <option value="published">published</option>
                      <option value="archived">archived</option>
                    </select>
                  </label>
                  <label className="admin-feature-toggle admin-field-span-2">
                    <input type="checkbox" checked={symbolForm.isFeatured} onChange={(event) => setSymbolForm((current) => ({ ...current, isFeatured: event.target.checked }))} />
                    <div>
                      <strong>Destacado editorial</strong>
                      <small>Aparecerá priorizado en listados y recomendaciones.</small>
                    </div>
                  </label>
                </div>
              </section>

              <section className="admin-editor-section">
                <header className="admin-editor-section-head">
                  <div className="admin-editor-section-icon">
                    <FileText size={16} />
                  </div>
                  <div>
                    <h3>Contenido</h3>
                    <p>Texto principal de la ficha pública.</p>
                  </div>
                </header>
                <div className="admin-editor-grid">
                  <label className="admin-field admin-field-span-2">
                    <span className="admin-field-label">Significado</span>
                    <textarea className="admin-textarea admin-textarea-lg" value={symbolForm.meaning} onChange={(event) => setSymbolForm((current) => ({ ...current, meaning: event.target.value }))} placeholder="Define el significado principal del símbolo..." />
                  </label>
                  <label className="admin-field admin-field-span-2">
                    <span className="admin-field-label">Historia</span>
                    <textarea className="admin-textarea admin-textarea-lg" value={symbolForm.history} onChange={(event) => setSymbolForm((current) => ({ ...current, history: event.target.value }))} placeholder="Contexto histórico y evolución..." />
                  </label>
                  <label className="admin-field admin-field-span-2">
                    <span className="admin-field-label">Origen</span>
                    <textarea className="admin-textarea" value={symbolForm.origin} onChange={(event) => setSymbolForm((current) => ({ ...current, origin: event.target.value }))} placeholder="Origen cultural, geográfico o técnico..." />
                  </label>
                  <label className="admin-field admin-field-span-2">
                    <span className="admin-field-label">Usos actuales</span>
                    <textarea className="admin-textarea" value={symbolForm.currentUses} onChange={(event) => setSymbolForm((current) => ({ ...current, currentUses: event.target.value }))} placeholder="Aplicaciones modernas y contextos de uso..." />
                  </label>
                </div>
              </section>

              <section className="admin-editor-section">
                <header className="admin-editor-section-head">
                  <div className="admin-editor-section-icon">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <h3>Variantes y curiosidades</h3>
                    <p>Listas enriquecidas para completar la narrativa de la ficha.</p>
                  </div>
                </header>
                <div className="admin-editor-grid">
                  <label className="admin-field">
                    <span className="admin-field-label">Variantes (una por línea)</span>
                    <textarea className="admin-textarea" value={symbolForm.variantsText} onChange={(event) => setSymbolForm((current) => ({ ...current, variantsText: event.target.value }))} placeholder="∞ horizontal&#10;infinity loop" />
                  </label>
                  <label className="admin-field">
                    <span className="admin-field-label">Curiosidades (una por línea)</span>
                    <textarea className="admin-textarea" value={symbolForm.curiositiesText} onChange={(event) => setSymbolForm((current) => ({ ...current, curiositiesText: event.target.value }))} placeholder="Usado en joyería moderna&#10;Popular en tatuajes minimalistas" />
                  </label>
                </div>
              </section>

              <section className="admin-editor-section">
                <header className="admin-editor-section-head">
                  <div className="admin-editor-section-icon">
                    <Link2 size={16} />
                  </div>
                  <div>
                    <h3>Relaciones semánticas</h3>
                    <p>Alias, sinónimos y conexiones con otros símbolos.</p>
                  </div>
                </header>
                <div className="admin-editor-grid">
                  <label className="admin-field">
                    <span className="admin-field-label">Alias (uno por línea)</span>
                    <textarea className="admin-textarea" value={symbolForm.aliasesText} onChange={(event) => setSymbolForm((current) => ({ ...current, aliasesText: event.target.value }))} placeholder="sigma&#10;sumatoria" />
                  </label>
                  <label className="admin-field">
                    <span className="admin-field-label">Sinónimos (uno por línea)</span>
                    <textarea className="admin-textarea" value={symbolForm.synonymsText} onChange={(event) => setSymbolForm((current) => ({ ...current, synonymsText: event.target.value }))} placeholder="lemniscata&#10;símbolo de infinito" />
                  </label>
                  <label className="admin-field">
                    <span className="admin-field-label">Etiquetas (una por línea)</span>
                    <textarea className="admin-textarea" value={symbolForm.tagsText} onChange={(event) => setSymbolForm((current) => ({ ...current, tagsText: event.target.value }))} placeholder="matemática&#10;serie" />
                  </label>
                  <label className="admin-field">
                    <span className="admin-field-label">Relacionados por slug (uno por línea)</span>
                    <textarea className="admin-textarea" value={symbolForm.relatedText} onChange={(event) => setSymbolForm((current) => ({ ...current, relatedText: event.target.value }))} placeholder="infinito&#10;pi" />
                  </label>
                </div>
              </section>

              <section className="admin-editor-section">
                <header className="admin-editor-section-head">
                  <div className="admin-editor-section-icon">
                    <Images size={16} />
                  </div>
                  <div>
                    <h3>Multimedia</h3>
                    <p>Recursos visuales asociados a la ficha.</p>
                  </div>
                </header>
                <div className="admin-editor-grid">
                  <label className="admin-field admin-field-span-2">
                    <span className="admin-field-label">Medios / URLs (una por línea)</span>
                    <textarea className="admin-textarea" value={symbolForm.mediaLines} onChange={(event) => setSymbolForm((current) => ({ ...current, mediaLines: event.target.value }))} placeholder="/signipedia-media/symbol.png" />
                  </label>
                </div>
              </section>

              <section className="admin-editor-section">
                <header className="admin-editor-section-head">
                  <div className="admin-editor-section-icon">
                    <Globe size={16} />
                  </div>
                  <div>
                    <h3>SEO y difusión</h3>
                    <p>Metadatos visibles en buscadores y previews.</p>
                  </div>
                </header>
                <div className="admin-editor-grid">
                  <label className="admin-field admin-field-span-2">
                    <span className="admin-field-label">Descripción SEO</span>
                    <textarea className="admin-textarea" value={symbolForm.description} onChange={(event) => setSymbolForm((current) => ({ ...current, description: event.target.value }))} placeholder="Resumen editorial para SEO y redes..." />
                  </label>
                </div>
              </section>

              <section className="admin-editor-section">
                <header className="admin-editor-section-head">
                  <div className="admin-editor-section-icon">
                    <Settings2 size={16} />
                  </div>
                  <div>
                    <h3>Metadatos avanzados</h3>
                    <p>Campos estructurados para histórico, fuentes y traducciones.</p>
                  </div>
                </header>
                <div className="admin-editor-grid">
                  <label className="admin-field admin-field-span-2">
                    <span className="admin-field-label">Períodos históricos (JSON)</span>
                    <textarea className="admin-textarea admin-textarea-lg" value={symbolForm.periodsJson} onChange={(event) => setSymbolForm((current) => ({ ...current, periodsJson: event.target.value }))} />
                  </label>
                  <label className="admin-field admin-field-span-2">
                    <span className="admin-field-label">Fuentes (JSON)</span>
                    <textarea className="admin-textarea admin-textarea-lg" value={symbolForm.sourcesJson} onChange={(event) => setSymbolForm((current) => ({ ...current, sourcesJson: event.target.value }))} />
                  </label>
                  <label className="admin-field admin-field-span-2">
                    <span className="admin-field-label">Traducciones (JSON)</span>
                    <textarea className="admin-textarea admin-textarea-lg" value={symbolForm.translationsJson} onChange={(event) => setSymbolForm((current) => ({ ...current, translationsJson: event.target.value }))} />
                  </label>
                </div>
              </section>
            </div>

            <div className="admin-form-actions">
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

          <aside className="admin-aside-grid">
            <article className="admin-card">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-thor-muted">Embeddings de visión</div>
                  <h2 className="text-lg font-semibold">Backfill CLIP</h2>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void generateVisionEmbeddings();
                  }}
                  leftIcon={isBackfilling ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  disabled={isBackfilling}
                >
                  {isBackfilling ? "Procesando..." : "Generar embeddings de imágenes"}
                </Button>
              </div>

              <div className="grid gap-2 text-sm text-thor-muted">
                <div>Símbolos: {backfillTotals?.symbolsTotal ?? "-"}</div>
                <div>Con imagen: {backfillTotals?.withImage ?? "-"}</div>
                <div>Sin imagen: {backfillTotals?.missingImage ?? "-"}</div>
                <div>Embeddings 512 válidos: {backfillTotals?.valid512 ?? "-"}</div>
                <div>Pendientes: {backfillTotals?.pending ?? "-"}</div>
              </div>

              {backfillProgress ? (
                <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-thor-muted">
                  <div>
                    Progreso: {backfillProgress.current}/{backfillProgress.total}
                  </div>
                  <div>
                    OK: {backfillProgress.success} · SKIP: {backfillProgress.skipped} · ERR: {backfillProgress.failed}
                  </div>
                  <div>Actual: {backfillProgress.currentSlug}</div>
                </div>
              ) : null}

              {backfillLogs.length > 0 ? (
                <div className="mt-4 max-h-56 overflow-auto rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-thor-muted">
                  {backfillLogs.map((line, index) => (
                    <div key={`${line}-${index}`} className="mb-1">{line}</div>
                  ))}
                </div>
              ) : null}
            </article>

            <article className="admin-card admin-categories-panel">
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

            <article className="admin-card">
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
                  <div key={category.id} className="admin-category-row flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm">
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
                      <strong className="admin-category-name block">{category.name}</strong>
                      <span className="admin-category-meta text-xs">{category.slug}</span>
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

        <section className="admin-card admin-enter admin-symbol-search">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="admin-symbol-search-label inline-flex items-center gap-2 text-sm">
              <Search size={16} />
              Buscar símbolos
            </div>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="admin-symbol-search-input ml-auto w-full max-w-lg rounded-xl border px-3 py-2 text-sm outline-none"
              placeholder="Buscar por nombre, alias, etiqueta o descripción..."
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredSymbols.map((entry) => (
              <button
                key={entry.symbol.id}
                type="button"
                onClick={() => loadSymbolFromList(entry)}
                className={`admin-symbol-card rounded-2xl border p-4 text-left transition ${selectedSymbolSlug === entry.symbol.slug ? "admin-symbol-card-selected" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="admin-symbol-glyph text-2xl font-semibold">{entry.symbol.canonicalGlyph || "∎"}</div>
                    <h3 className="admin-symbol-name mt-2 text-base font-semibold">{entry.symbol.name}</h3>
                    <p className="admin-symbol-meta mt-1 text-xs">{entry.symbol.slug}</p>
                  </div>
                  <span className="admin-symbol-status rounded-full border px-2 py-1 text-[11px] uppercase tracking-wider">{entry.symbol.status}</span>
                </div>
                <p className="admin-symbol-meaning mt-3 line-clamp-3 text-sm">{entry.symbol.meaning}</p>
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
