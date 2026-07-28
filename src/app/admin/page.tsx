"use client";

import { useCallback, useMemo, useState } from "react";

type AdminDocument = {
  id: string;
  name: string;
  category: string;
  status: "queued" | "indexing" | "ready" | "failed";
  indexedAt: string | null;
  chunkCount: number;
  createdAt: string;
};

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString();
}

export default function AdminKnowledgePage() {
  const [adminKey, setAdminKey] = useState("");
  const [category, setCategory] = useState("general");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [documents, setDocuments] = useState<AdminDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("Provide admin key and load documents.");

  const headers = useMemo(
    () => ({
      "x-thor-admin-key": adminKey,
    }),
    [adminKey]
  );

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setStatusText("Loading documents...");

    try {
      const response = await fetch("/api/admin/knowledge/documents", {
        headers,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message || data?.error || "Failed to load documents");
      }

      setDocuments(data.documents || []);
      setStatusText(`Loaded ${data.documents?.length || 0} documents.`);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [headers]);

  const uploadDocument = useCallback(async () => {
    if (!uploadFile) {
      setStatusText("Select a PDF first.");
      return;
    }

    setLoading(true);
    setStatusText("Uploading and indexing document...");

    try {
      const form = new FormData();
      form.set("file", uploadFile);
      form.set("category", category);

      const response = await fetch("/api/admin/knowledge/documents", {
        method: "POST",
        headers,
        body: form,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message || data?.error || "Upload failed");
      }

      setStatusText("Document indexed successfully.");
      await loadDocuments();
      setUploadFile(null);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [uploadFile, category, headers, loadDocuments]);

  const deleteDocument = useCallback(
    async (documentId: string) => {
      setLoading(true);
      setStatusText("Deleting document...");

      try {
        const response = await fetch(`/api/admin/knowledge/documents/${documentId}`, {
          method: "DELETE",
          headers,
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error?.message || data?.error || "Delete failed");
        }

        setStatusText("Document deleted.");
        await loadDocuments();
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    },
    [headers, loadDocuments]
  );

  const reindexDocument = useCallback(
    async (documentId: string) => {
      setLoading(true);
      setStatusText("Reindexing document...");

      try {
        const response = await fetch(`/api/admin/knowledge/documents/${documentId}/reindex`, {
          method: "POST",
          headers,
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error?.message || data?.error || "Reindex failed");
        }

        setStatusText("Reindex started.");
        await loadDocuments();
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    },
    [headers, loadDocuments]
  );

  const updateCategory = useCallback(
    async (documentId: string, nextCategory: string) => {
      setLoading(true);
      setStatusText("Updating category...");

      try {
        const response = await fetch(`/api/admin/knowledge/documents/${documentId}`, {
          method: "PATCH",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ category: nextCategory }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error?.message || data?.error || "Update failed");
        }

        setStatusText("Category updated.");
        await loadDocuments();
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    },
    [headers, loadDocuments]
  );

  return (
    <main className="nova-shell" style={{ gridTemplateColumns: "1fr" }}>
      <section className="nova-main">
        <header className="nova-topbar">
          <div className="nova-topbar-title-wrap">
            <div className="thor-v2-badge">Admin Console</div>
            <div className="nova-topbar-title">ThorAI Knowledge Engine</div>
            <div className="nova-topbar-subtitle">Base de conocimiento gestionada por administrador</div>
          </div>
        </header>

        <section className="nova-workbench">
          <section className="panel" style={{ padding: 16, display: "grid", gap: 12 }}>
            <h3 style={{ margin: 0 }}>📚 Base de conocimiento</h3>

            <label className="field-label" htmlFor="admin-key">
              Clave de administrador
              <input
                id="admin-key"
                className="text-input"
                type="password"
                value={adminKey}
                onChange={(event) => setAdminKey(event.target.value)}
                placeholder="THOR_ADMIN_KEY"
              />
            </label>

            <div className="translation-grid">
              <label className="field-label" htmlFor="knowledge-category">
                Categoria
                <input
                  id="knowledge-category"
                  className="text-input"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder="general"
                />
              </label>

              <label className="field-label" htmlFor="knowledge-file">
                [ Añadir PDF ]
                <input
                  id="knowledge-file"
                  className="field"
                  type="file"
                  accept="application/pdf"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    setUploadFile(file);
                  }}
                />
              </label>
            </div>

            <div className="inline-actions">
              <button className="btn btn-primary btn-md" type="button" onClick={uploadDocument} disabled={loading}>
                Añadir PDF
              </button>
              <button className="btn btn-secondary btn-md" type="button" onClick={loadDocuments} disabled={loading}>
                Actualizar
              </button>
            </div>

            <p className="nova-muted" style={{ margin: 0 }}>
              {statusText}
            </p>
          </section>

          <section className="panel" style={{ padding: 16 }}>
            <div className="panel-head" style={{ padding: 0, marginBottom: 12, borderBottom: "none" }}>
              <h3 style={{ margin: 0 }}>Documentos</h3>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: 8 }}>Documento</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Estado</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Fecha de indexacion</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Fragmentos</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Categoria</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.length === 0 ? (
                    <tr>
                      <td style={{ padding: 8 }} colSpan={6}>
                        Sin documentos.
                      </td>
                    </tr>
                  ) : (
                    documents.map((document) => (
                      <tr key={document.id}>
                        <td style={{ padding: 8 }}>{document.name}</td>
                        <td style={{ padding: 8 }}>{document.status}</td>
                        <td style={{ padding: 8 }}>{formatDate(document.indexedAt)}</td>
                        <td style={{ padding: 8 }}>{document.chunkCount}</td>
                        <td style={{ padding: 8 }}>
                          <input
                            className="text-input"
                            defaultValue={document.category}
                            onBlur={(event) => {
                              const next = event.target.value.trim();
                              if (next && next !== document.category) {
                                void updateCategory(document.id, next);
                              }
                            }}
                          />
                        </td>
                        <td style={{ padding: 8 }}>
                          <div className="inline-actions">
                            <button
                              className="btn btn-secondary btn-sm"
                              type="button"
                              onClick={() => {
                                void reindexDocument(document.id);
                              }}
                              disabled={loading}
                            >
                              Reindexar
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              type="button"
                              onClick={() => {
                                void deleteDocument(document.id);
                              }}
                              disabled={loading}
                            >
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
          </section>
        </section>
      </section>
    </main>
  );
}
