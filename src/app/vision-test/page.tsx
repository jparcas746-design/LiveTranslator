"use client";

import { useMemo, useRef, useState } from "react";
import { CLIP_VISION_MODEL_ID } from "@/thor/signipedia/recognition/clipConfig";
import { generateClipImageEmbedding, isClipRuntimeLoaded, loadClipVisionRuntime, type ClipEmbeddingReport } from "@/lib/clipVisionClient";

const DEFAULT_MODEL_ID = CLIP_VISION_MODEL_ID;

export default function VisionTestPage() {
  const runtimeRef = useRef<{ modelId: string } | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [loadingModel, setLoadingModel] = useState(false);
  const [generatingEmbedding, setGeneratingEmbedding] = useState(false);

  const [modelLoaded, setModelLoaded] = useState(false);
  const [modelStatus, setModelStatus] = useState("Modelo no cargado.");
  const [embeddingStatus, setEmbeddingStatus] = useState("Sin embedding generado.");
  const [embeddingReport, setEmbeddingReport] = useState<ClipEmbeddingReport | null>(null);

  const canGenerateEmbedding = useMemo(() => {
    return Boolean((runtimeRef.current || isClipRuntimeLoaded()) && selectedImage && !generatingEmbedding);
  }, [selectedImage, generatingEmbedding]);

  function updateImage(file: File | null) {
    setSelectedImage(file);
    setEmbeddingReport(null);
    setEmbeddingStatus("Sin embedding generado.");

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    if (!file) {
      setPreviewUrl(null);
      return;
    }

    setPreviewUrl(URL.createObjectURL(file));
  }

  async function loadClipModel() {
    if (runtimeRef.current || isClipRuntimeLoaded()) {
      setModelLoaded(true);
      setModelStatus(`Modelo ya cargado: ${DEFAULT_MODEL_ID}`);
      return;
    }

    setLoadingModel(true);
    setModelStatus("Cargando Transformers.js y modelo CLIP...");

    try {
      const runtime = await loadClipVisionRuntime();
      runtimeRef.current = { modelId: runtime.modelId };

      setModelLoaded(true);
      setModelStatus(`Modelo cargado correctamente: ${DEFAULT_MODEL_ID}`);
    } catch (error) {
      setModelLoaded(false);
      setModelStatus(
        `Error al cargar CLIP: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setLoadingModel(false);
    }
  }

  async function generateEmbedding() {
    if (!(runtimeRef.current || isClipRuntimeLoaded()) || !selectedImage) {
      return;
    }

    setGeneratingEmbedding(true);
    setEmbeddingReport(null);
    setEmbeddingStatus("Generando embedding de imagen...");

    try {
      const report = await generateClipImageEmbedding(selectedImage);
      setEmbeddingReport(report);
      setEmbeddingStatus("Embedding generado correctamente.");
    } catch (error) {
      setEmbeddingStatus(
        `Error al generar embedding: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setGeneratingEmbedding(false);
    }
  }

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "2.5rem 1rem 4rem" }}>
      <h1 style={{ fontSize: "2rem", marginBottom: "0.6rem" }}>Vision Test</h1>
      <p style={{ marginBottom: "1.4rem", color: "#475569" }}>
        Prueba aislada de Transformers.js con CLIP para verificar carga de modelo y generación de embedding.
      </p>

      <section
        style={{
          border: "1px solid #d1d5db",
          borderRadius: 14,
          padding: "1rem",
          marginBottom: "1rem",
          background: "#ffffff",
        }}
      >
        <h2 style={{ fontSize: "1.05rem", marginBottom: "0.7rem" }}>1) Cargar modelo CLIP</h2>
        <button
          type="button"
          onClick={() => {
            void loadClipModel();
          }}
          disabled={loadingModel}
          style={{
            borderRadius: 10,
            border: "1px solid #1d4ed8",
            background: loadingModel ? "#93c5fd" : "#2563eb",
            color: "white",
            padding: "0.55rem 0.95rem",
            cursor: loadingModel ? "not-allowed" : "pointer",
          }}
        >
          {loadingModel ? "Cargando modelo..." : "Cargar CLIP"}
        </button>

        <p style={{ marginTop: "0.7rem", marginBottom: 0 }}>
          Estado del modelo: <strong>{modelStatus}</strong>
        </p>
        <p style={{ marginTop: "0.35rem", color: modelLoaded ? "#166534" : "#92400e" }}>
          {modelLoaded ? "Transformers.js activo en cliente." : "Aún no se ha validado la carga del modelo."}
        </p>
      </section>

      <section
        style={{
          border: "1px solid #d1d5db",
          borderRadius: 14,
          padding: "1rem",
          background: "#ffffff",
        }}
      >
        <h2 style={{ fontSize: "1.05rem", marginBottom: "0.7rem" }}>2) Subir imagen y generar embedding</h2>

        <input
          type="file"
          accept="image/*"
          onChange={(event) => {
            updateImage(event.target.files?.[0] || null);
            event.currentTarget.value = "";
          }}
        />

        {previewUrl ? (
          <div style={{ marginTop: "0.8rem" }}>
            <img
              src={previewUrl}
              alt="Vista previa"
              style={{ width: "100%", maxWidth: 420, borderRadius: 10, border: "1px solid #cbd5e1" }}
            />
          </div>
        ) : null}

        <div style={{ marginTop: "0.9rem" }}>
          <button
            type="button"
            onClick={() => {
              void generateEmbedding();
            }}
            disabled={!canGenerateEmbedding}
            style={{
              borderRadius: 10,
              border: "1px solid #0f766e",
              background: canGenerateEmbedding ? "#0f766e" : "#99f6e4",
              color: "white",
              padding: "0.55rem 0.95rem",
              cursor: canGenerateEmbedding ? "pointer" : "not-allowed",
            }}
          >
            {generatingEmbedding ? "Generando embedding..." : "Generar embedding"}
          </button>
        </div>

        <p style={{ marginTop: "0.7rem", marginBottom: 0 }}>
          Estado del embedding: <strong>{embeddingStatus}</strong>
        </p>

        {embeddingReport ? (
          <div
            style={{
              marginTop: "0.8rem",
              padding: "0.8rem",
              borderRadius: 10,
              border: "1px solid #86efac",
              background: "#f0fdf4",
            }}
          >
            <p style={{ margin: "0 0 0.35rem" }}>
              Embedding generado: <strong>sí</strong>
            </p>
            <p style={{ margin: "0 0 0.35rem" }}>
              Dimensiones: <strong>{JSON.stringify(embeddingReport.dims)}</strong>
            </p>
            <p style={{ margin: "0 0 0.35rem" }}>
              Longitud total: <strong>{embeddingReport.length}</strong>
            </p>
            <p style={{ margin: 0 }}>
              Primeros valores: <strong>{embeddingReport.preview.join(", ")}</strong>
            </p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
