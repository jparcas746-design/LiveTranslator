"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpenText,
  CircleCheck,
  FileSearch,
  FileText,
  FileType,
  FileUp,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { fetchJson } from "@/lib/fetchJson";

type AdminDocument = {
  id: string;
  name: string;
  category: string;
  status: "queued" | "indexing" | "ready" | "failed";
  indexedAt: string | null;
  chunkCount: number;
  createdAt: string;
};

type SearchChunk = {
  score: number;
  chunk: {
    id: string;
    content: string;
    pageNumber: number | null;
  };
  document: {
    id: string;
    name: string;
    category: string;
  };
};

type UploadKind = "pdf" | "word" | "text";

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function fileAcceptByKind(kind: UploadKind) {
  if (kind === "pdf") return ".pdf,application/pdf";
  if (kind === "word") return ".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return ".txt,text/plain";
}

function getStatusClasses(status: AdminDocument["status"]) {
  if (status === "ready") {
    return "bg-emerald-500/20 text-emerald-200 border border-emerald-400/30";
  }
  if (status === "failed") {
    return "bg-rose-500/20 text-rose-200 border border-rose-400/30";
  }
  if (status === "indexing") {
    return "bg-amber-500/20 text-amber-200 border border-amber-400/30";
  }
  return "bg-slate-500/20 text-slate-200 border border-slate-400/30";
}

function uploadWithProgress(
  url: string,
  formData: FormData,
  onProgress: (percent: number) => void
): Promise<{
  ok: boolean;
  status: number;
  data?: unknown;
  error?: string;
  details?: { contentType: string; preview: string };
}> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)));
      onProgress(percent);
    });

    xhr.addEventListener("load", () => {
      const contentType = xhr.getResponseHeader("content-type") || "";
      const bodyText = xhr.responseText || "";

      console.log("ADMIN_UPLOAD_RESPONSE", {
        url,
        status: xhr.status,
        contentType,
        preview: bodyText.replace(/\s+/g, " ").slice(0, 240),
      });

      if (!contentType.toLowerCase().includes("application/json")) {
        resolve({
          ok: false,
          status: xhr.status,
          error: `Expected JSON but received '${contentType || "unknown"}'`,
          details: {
            contentType,
            preview: bodyText.replace(/\s+/g, " ").slice(0, 240),
          },
        });
        return;
      }

      try {
        const parsed = bodyText ? JSON.parse(bodyText) : {};
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ ok: true, status: xhr.status, data: parsed });
        } else {
          const message =
            typeof parsed?.error === "string"
              ? parsed.error
              : parsed?.error?.message || `Upload failed with status ${xhr.status}`;
          resolve({ ok: false, status: xhr.status, error: message });
        }
      } catch {
        resolve({
          ok: false,
          status: xhr.status,
          error: "Invalid JSON response from server",
          details: {
            contentType,
            preview: bodyText.replace(/\s+/g, " ").slice(0, 240),
          },
        });
      }
    });

    xhr.addEventListener("error", () => {
      resolve({ ok: false, status: 0, error: "Network error during upload" });
    });

    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.send(formData);
  });
}

export default function AdminKnowledgePage() {
  const [authState, setAuthState] = useState<"checking" | "locked" | "authenticated">("checking");
  const [authInput, setAuthInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const [category, setCategory] = useState("general");
  const [documents, setDocuments] = useState<AdminDocument[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchChunk[]>([]);
  const [statusText, setStatusText] = useState("Ready");

  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [workingDocumentId, setWorkingDocumentId] = useState<string | null>(null);

  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingUploadKind, setPendingUploadKind] = useState<UploadKind>("pdf");

  const isBusy = loadingDocs || uploading || Boolean(workingDocumentId);

  const checkSession = useCallback(async () => {
    const result = await fetchJson<{ authenticated: boolean }>("/api/admin/session", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    if (!result.ok) {
      console.error("ADMIN_SESSION_CHECK_ERROR", result);
      setAuthState("locked");
      setAuthError("No se pudo validar la sesión de administrador.");
      return false;
    }

    if (!result.data.authenticated) {
      setAuthState("locked");
      return false;
    }

    setAuthState("authenticated");
    return true;
  }, []);

  const loadDocuments = useCallback(async () => {
    setLoadingDocs(true);
    setStatusText("Cargando documentos...");

    const result = await fetchJson<{ documents: AdminDocument[] }>("/api/admin/knowledge/documents", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    if (!result.ok) {
      console.error("ADMIN_DOCUMENTS_LOAD_ERROR", result);
      if (result.status === 401) {
        setAuthState("locked");
      }
      setStatusText(result.message);
      setLoadingDocs(false);
      return;
    }

    setDocuments(result.data.documents || []);
    setStatusText(`Documentos cargados: ${result.data.documents?.length || 0}`);
    setLoadingDocs(false);
  }, []);

  useEffect(() => {
    void (async () => {
      const ok = await checkSession();
      if (ok) {
        await loadDocuments();
      }
    })();
  }, [checkSession, loadDocuments]);

  const authenticate = useCallback(async () => {
    setAuthError(null);
    setStatusText("Validando credenciales...");

    const result = await fetchJson<{ authenticated: boolean }>("/api/admin/session", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: authInput }),
    });

    if (!result.ok) {
      console.error("ADMIN_AUTH_ERROR", result);
      setAuthError(result.message || "Credenciales inválidas");
      setStatusText("Acceso denegado");
      return;
    }

    setAuthInput("");
    setAuthState("authenticated");
    setStatusText("Sesión iniciada");
    await loadDocuments();
  }, [authInput, loadDocuments]);

  const logout = useCallback(async () => {
    await fetchJson("/api/admin/session", {
      method: "DELETE",
      credentials: "include",
    });

    setAuthState("locked");
    setDocuments([]);
    setSearchResults([]);
    setStatusText("Sesión cerrada");
  }, []);

  const requestUpload = useCallback((kind: UploadKind) => {
    setPendingUploadKind(kind);
    uploadInputRef.current?.click();
  }, []);

  const onSelectFile = useCallback(async (file: File | null) => {
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);
    setStatusText("Iniciando proceso de importación...");

    const form = new FormData();
    form.set("file", file);
    form.set("category", category || "general");

    console.log("ADMIN_UPLOAD_START", {
      endpoint: "/api/admin/knowledge/documents",
      fileName: file.name,
      fileType: file.type || "unknown",
      fileSize: file.size,
      category: category || "general",
    });

    const uploadResult = await uploadWithProgress("/api/admin/knowledge/documents", form, (value) => {
      setUploadProgress(value);
      if (value < 100) {
        setStatusText(`Subiendo archivo... ${value}%`);
      }
    });

    if (!uploadResult.ok) {
      console.error("ADMIN_UPLOAD_ERROR", uploadResult);
      if (uploadResult.status === 401) {
        setAuthState("locked");
      }
      if (uploadResult.details) {
        console.error("ADMIN_UPLOAD_ERROR_DETAILS", uploadResult.details);
      }
      setStatusText(uploadResult.error || "Error al subir el archivo");
      setUploading(false);
      return;
    }

    const payload = uploadResult.data as { result?: { chunkCount?: number } };
    const chunkCount = payload?.result?.chunkCount || 0;

    setUploadProgress(100);
    setStatusText(`Documento procesado correctamente. Fragmentos generados: ${chunkCount}`);
    setUploading(false);
    await loadDocuments();
  }, [category, loadDocuments]);

  const deleteDocument = useCallback(async (documentId: string) => {
    setWorkingDocumentId(documentId);
    setStatusText("Eliminando documento...");

    const result = await fetchJson<{ success: boolean }>(`/api/admin/knowledge/documents/${documentId}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!result.ok) {
      console.error("ADMIN_DELETE_ERROR", result);
      if (result.status === 401) {
        setAuthState("locked");
      }
      setStatusText(result.message);
      setWorkingDocumentId(null);
      return;
    }

    setStatusText("Documento eliminado");
    setWorkingDocumentId(null);
    await loadDocuments();
  }, [loadDocuments]);

  const reindexDocument = useCallback(async (documentId: string) => {
    setWorkingDocumentId(documentId);
    setStatusText("Solicitando reindexación...");

    const result = await fetchJson<{ success: boolean }>(`/api/admin/knowledge/documents/${documentId}/reindex`, {
      method: "POST",
      credentials: "include",
    });

    if (!result.ok) {
      console.error("ADMIN_REINDEX_ERROR", result);
      if (result.status === 401) {
        setAuthState("locked");
      }
      setStatusText(result.message);
      setWorkingDocumentId(null);
      return;
    }

    setStatusText("Reindexación solicitada");
    setWorkingDocumentId(null);
    await loadDocuments();
  }, [loadDocuments]);

  const runSearch = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      return;
    }

    setStatusText("Buscando fragmentos relevantes...");
    const result = await fetchJson<{ chunks: SearchChunk[] }>(`/api/admin/knowledge/search?q=${encodeURIComponent(query)}&limit=8`, {
      method: "GET",
      credentials: "include",
    });

    if (!result.ok) {
      console.error("ADMIN_SEARCH_ERROR", result);
      if (result.status === 401) {
        setAuthState("locked");
      }
      setStatusText(result.message);
      return;
    }

    setSearchResults(result.data.chunks || []);
    setStatusText(`Resultados encontrados: ${(result.data.chunks || []).length}`);
  }, [searchQuery]);

  const fileHint = useMemo(() => {
    if (pendingUploadKind === "pdf") return "PDF";
    if (pendingUploadKind === "word") return "Word";
    return "TXT";
  }, [pendingUploadKind]);

  return (
    <main className="min-h-screen bg-thor-bg text-thor-text admin-grid-bg">
      <input
        ref={uploadInputRef}
        type="file"
        className="hidden"
        accept={fileAcceptByKind(pendingUploadKind)}
        onChange={(event) => {
          const selected = event.target.files?.[0] || null;
          void onSelectFile(selected);
          event.currentTarget.value = "";
        }}
      />

      {authState === "checking" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-thor-muted">
              <Loader2 size={18} className="animate-spin" />
              <p className="text-sm">Validando sesion de administrador...</p>
            </div>
          </div>
        </div>
      ) : null}

      {authState === "locked" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-xl bg-indigo-500/20 p-2 text-indigo-300">
                <Shield size={22} />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Acceso Administrador</h2>
                <p className="text-sm text-thor-muted">Introduce la contraseña para abrir el panel.</p>
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
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-7xl p-4 md:p-8">
        <header className="mb-6 rounded-2xl border border-slate-700/70 bg-slate-900/90 p-5 shadow-xl backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-wider text-cyan-200">
                <BookOpenText size={14} />
                Knowledge Base
              </div>
              <h1 className="text-2xl font-bold md:text-3xl">ThorAI Admin Panel</h1>
              <p className="text-sm text-thor-muted">Importa documentos, monitorea indexación y consulta fragmentos.</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void loadDocuments();
                }}
                disabled={isBusy}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700 disabled:opacity-60"
              >
                <RefreshCw size={16} className={loadingDocs ? "animate-spin" : ""} />
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

        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-lg">
            <div className="mb-3 text-sm text-thor-muted">Subir documentos</div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => requestUpload("pdf")}
                disabled={isBusy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-3 py-2 text-sm font-medium hover:bg-indigo-400 disabled:opacity-60"
              >
                <FileUp size={16} />
                ➕ Subir PDF
              </button>
              <button
                type="button"
                onClick={() => requestUpload("word")}
                disabled={isBusy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-sm font-medium hover:bg-cyan-500 disabled:opacity-60"
              >
                <FileType size={16} />
                ➕ Subir Word
              </button>
              <button
                type="button"
                onClick={() => requestUpload("text")}
                disabled={isBusy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-700 px-3 py-2 text-sm font-medium hover:bg-slate-600 disabled:opacity-60"
              >
                <FileText size={16} />
                ➕ Subir TXT
              </button>
            </div>
            <p className="mt-3 text-xs text-thor-muted">Tipo seleccionado: {fileHint}</p>
          </article>

          <article className="rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-lg">
            <div className="mb-3 text-sm text-thor-muted">Categoría por defecto</div>
            <input
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              placeholder="general"
            />
            <p className="mt-3 text-xs text-thor-muted">Los metadatos usan esta categoría al indexar.</p>
          </article>

          <article className="rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-lg">
            <div className="mb-3 text-sm text-thor-muted">Progreso</div>
            <div className="mb-2 h-3 overflow-hidden rounded-full bg-slate-800">
              <div
                className="progress-shine h-full rounded-full transition-all"
                style={{ width: `${uploading ? uploadProgress : 0}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-thor-muted">
              <span>{uploading ? `Procesando ${uploadProgress}%` : "Sin carga activa"}</span>
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <CircleCheck size={14} />}
            </div>
            <p className="mt-3 text-xs text-thor-muted">{statusText}</p>
          </article>
        </section>

        <section className="mb-6 rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-lg">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 text-sm text-thor-muted">
              <Search size={16} />
              Buscar fragmentos
            </div>
            <div className="ml-auto flex w-full max-w-lg items-center gap-2">
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void runSearch();
                  }
                }}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-400"
                placeholder="Buscar por contenido..."
              />
              <button
                type="button"
                onClick={() => {
                  void runSearch();
                }}
                disabled={isBusy}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-sm font-medium hover:bg-cyan-500 disabled:opacity-60"
              >
                <FileSearch size={16} />
                Buscar
              </button>
            </div>
          </div>

          {searchResults.length > 0 ? (
            <div className="grid gap-3">
              {searchResults.map((entry) => (
                <article key={entry.chunk.id} className="rounded-xl border border-slate-700 bg-slate-950 p-3">
                  <div className="mb-2 flex items-center justify-between text-xs text-thor-muted">
                    <span>{entry.document.name}</span>
                    <span>Score: {entry.score.toFixed(3)}</span>
                  </div>
                  <p className="text-sm text-thor-text">{entry.chunk.content.slice(0, 260)}...</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-thor-muted">Sin resultados aún.</p>
          )}
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-lg">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Lista de documentos</h2>
            <span className="text-xs text-thor-muted">Total: {documents.length}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-700 text-sm">
              <thead>
                <tr className="text-left text-thor-muted">
                  <th className="px-3 py-2 font-medium">Nombre</th>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Fragmentos</th>
                  <th className="px-3 py-2 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {documents.length === 0 ? (
                  <tr>
                    <td className="px-3 py-5 text-thor-muted" colSpan={5}>
                      No hay documentos indexados.
                    </td>
                  </tr>
                ) : (
                  documents.map((document) => (
                    <tr key={document.id} className="transition hover:bg-slate-800/40">
                      <td className="px-3 py-3">
                        <div className="font-medium text-thor-text">{document.name}</div>
                        <div className="text-xs text-thor-muted">{document.category}</div>
                      </td>
                      <td className="px-3 py-3 text-thor-muted">{formatDate(document.indexedAt || document.createdAt)}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs ${getStatusClasses(document.status)}`}>
                          {document.status}
                        </span>
                      </td>
                      <td className="px-3 py-3">{document.chunkCount}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setCategory(document.category || "general");
                              setStatusText(`Categoría cargada en editor: ${document.category}`);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-xs hover:bg-slate-700"
                            disabled={isBusy}
                          >
                            <RefreshCw size={12} />
                            Actualizar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void reindexDocument(document.id);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-200 hover:bg-cyan-500/20"
                            disabled={isBusy}
                          >
                            <RefreshCw size={12} className={workingDocumentId === document.id ? "animate-spin" : ""} />
                            Reindexar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void deleteDocument(document.id);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/20"
                            disabled={isBusy}
                          >
                            <Trash2 size={12} />
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-thor-muted">
            <UploadCloud size={14} />
            Barra de progreso activa durante subida y procesamiento inicial.
          </div>
        </section>
      </div>
    </main>
  );
}
