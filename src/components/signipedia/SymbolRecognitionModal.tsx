"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImageUp, Loader2, Sparkles, X } from "lucide-react";
import { VISION_EMBEDDING_DIMENSIONS } from "@/thor/signipedia/recognition/vectorMath";
import {
  generateClipImageEmbedding,
  isClipRuntimeLoaded,
  loadClipVisionRuntime,
  optimizeImageForVision,
} from "@/lib/clipVisionClient";

type RecognitionSource = "camera" | "upload";

type HybridMatch = {
  slug: string;
  name: string;
  glyph: string;
  confidence: number;
  meaning: string;
  imageUrl: string | null;
  categoryName: string | null;
  reason: string;
  sourceScore: number;
};

type VisionCandidate = {
  name: string;
  slug?: string;
  glyph?: string;
  confidence: number;
  aliases: string[];
  meaning?: string;
  description?: string;
  context?: string;
};

type RecognitionResult = {
  provider: string;
  summary: string;
  lowConfidence: boolean;
  candidates: VisionCandidate[];
  matches: HybridMatch[];
  bestMatch: HybridMatch | null;
  shouldAutoRedirect: boolean;
  analyzedAt: string;
  warning?: string;
  traceId?: string;
};

type SymbolRecognitionModalProps = {
  open: boolean;
  onClose: () => void;
};

type ProcessingStage = "idle" | "preparing" | "analyzing" | "searching";

function confidenceLabel(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

export function SymbolRecognitionModal({ open, onClose }: SymbolRecognitionModalProps) {
  const router = useRouter();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const autoRedirectTimerRef = useRef<number | null>(null);
  const slowProcessTimerRef = useRef<number | null>(null);

  const [source, setSource] = useState<RecognitionSource | null>(null);
  const [preparedFile, setPreparedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<ProcessingStage>("idle");
  const [isLongRunning, setIsLongRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [redirectTarget, setRedirectTarget] = useState<string | null>(null);

  const isPreparing = stage === "preparing";
  const isAnalyzing = stage === "analyzing" || stage === "searching";

  const stageLabel = useMemo(() => {
    if (stage === "preparing") return "Preparando imagen...";
    if (stage === "analyzing") return "Analizando con IA...";
    if (stage === "searching") return "Buscando coincidencias...";
    return "";
  }, [stage]);

  const heading = useMemo(() => {
    if (stage === "preparing") return "Preparando imagen";
    if (stage === "analyzing") return "Analizando con IA";
    if (stage === "searching") return "Buscando coincidencias";
    if (result) return "Resultado del reconocimiento";
    return "Reconocer símbolo con IA";
  }, [result, stage]);

  const lowConfidenceMessage = useMemo(() => {
    if (!result?.lowConfidence) {
      return null;
    }

    if (result.bestMatch || result.matches.length > 0) {
      return null;
    }

    return "Aún no hemos podido reconocer este símbolo. Estamos ampliando continuamente nuestra biblioteca visual. Mientras tanto, puedes consultar las sugerencias o buscar el símbolo manualmente.";
  }, [result]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [onClose, open]);

  useEffect(() => {
    return () => {
      if (autoRedirectTimerRef.current) {
        window.clearTimeout(autoRedirectTimerRef.current);
      }
      if (slowProcessTimerRef.current) {
        window.clearTimeout(slowProcessTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!open) {
      setSource(null);
      setPreparedFile(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
      setStage("idle");
      setIsLongRunning(false);
      setError(null);
      setResult(null);
      setRedirectTarget(null);
      if (autoRedirectTimerRef.current) {
        window.clearTimeout(autoRedirectTimerRef.current);
        autoRedirectTimerRef.current = null;
      }
      if (slowProcessTimerRef.current) {
        window.clearTimeout(slowProcessTimerRef.current);
        slowProcessTimerRef.current = null;
      }
    }
  }, [open, previewUrl]);

  function handleFileDialog(nextSource: RecognitionSource) {
    if (nextSource === "camera") {
      cameraInputRef.current?.click();
    } else {
      uploadInputRef.current?.click();
    }
  }

  async function handleSelectedFile(file: File | null, nextSource: RecognitionSource) {
    if (!file) {
      return;
    }

    setSource(nextSource);
    setError(null);
    setResult(null);
    setRedirectTarget(null);
    setStage("preparing");

    try {
      const optimized = await optimizeImageForVision(file, {
        maxDimension: 768,
        quality: 0.82,
        maxBytes: 1_200_000,
      });
      setPreparedFile(optimized);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(URL.createObjectURL(optimized));
    } catch (preprocessError) {
      setError(preprocessError instanceof Error ? preprocessError.message : "No se pudo procesar la imagen seleccionada.");
    } finally {
      setStage("idle");
    }
  }

  async function recognize() {
    if (!preparedFile || !source) {
      return;
    }

    setError(null);
    setResult(null);
    setStage("analyzing");
    setIsLongRunning(false);

    if (slowProcessTimerRef.current) {
      window.clearTimeout(slowProcessTimerRef.current);
    }

    slowProcessTimerRef.current = window.setTimeout(() => {
      setIsLongRunning(true);
    }, 3600);

    const endpoint = source === "camera" ? "/api/recognition/camera" : "/api/recognition/image";
    const formData = new FormData();
    formData.set("image", preparedFile);

    try {
      try {
        if (!isClipRuntimeLoaded()) {
          await loadClipVisionRuntime();
        }

        const report = await generateClipImageEmbedding(preparedFile);
        if (report.length === VISION_EMBEDDING_DIMENSIONS) {
          formData.set("imageEmbedding", JSON.stringify(report.vector));
        }
      } catch {
        // If local CLIP embedding fails, backend can still use provider-based recognition.
      }

      setStage("searching");

      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as RecognitionResult | { error?: string; details?: string };
      if (!response.ok) {
        const message = "error" in payload ? `${payload.error}${payload.details ? `: ${payload.details}` : ""}` : "No se pudo analizar la imagen.";
        throw new Error(message);
      }

      const recognized = payload as RecognitionResult;
      setResult(recognized);

      if (recognized.shouldAutoRedirect && recognized.bestMatch) {
        const target = `/simbolo/${recognized.bestMatch.slug}`;
        setRedirectTarget(target);
        autoRedirectTimerRef.current = window.setTimeout(() => {
          router.push(target);
        }, 900);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo analizar la imagen.");
    } finally {
      if (slowProcessTimerRef.current) {
        window.clearTimeout(slowProcessTimerRef.current);
        slowProcessTimerRef.current = null;
      }
      setIsLongRunning(false);
      setStage("idle");
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="signipedia-recognition-overlay" role="dialog" aria-modal="true" aria-label="Reconocimiento de símbolos con IA">
      <div className="signipedia-recognition-modal">
        <header className="signipedia-recognition-head">
          <div>
            <p className="signipedia-section-label">Visión + búsqueda híbrida</p>
            <h2>{heading}</h2>
          </div>
          <button type="button" className="signipedia-recognition-close" onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </button>
        </header>

        <p className="signipedia-recognition-note">
          Captura o sube una imagen. Analizaremos forma, contexto y texto semántico para encontrar el mejor símbolo en Signipedia.
        </p>

        <div className="signipedia-recognition-actions">
          <button type="button" className="signipedia-recognition-pick" onClick={() => handleFileDialog("camera")}>
            <Camera size={18} />
            <span>Usar cámara</span>
          </button>
          <button type="button" className="signipedia-recognition-pick" onClick={() => handleFileDialog("upload")}>
            <ImageUp size={18} />
            <span>Subir imagen</span>
          </button>
        </div>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            void handleSelectedFile(event.target.files?.[0] || null, "camera");
            event.currentTarget.value = "";
          }}
        />

        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            void handleSelectedFile(event.target.files?.[0] || null, "upload");
            event.currentTarget.value = "";
          }}
        />

        {previewUrl ? (
          <div className="signipedia-recognition-preview">
            <img src={previewUrl} alt="Vista previa de símbolo" />
          </div>
        ) : null}

        {stage !== "idle" ? (
          <div className="signipedia-recognition-progress" role="status" aria-live="polite">
            <Loader2 size={16} className="spin" />
            <span>{stageLabel}</span>
            {isLongRunning ? <small>El análisis continúa. Puede tardar unos segundos más.</small> : null}
            <div className="signipedia-recognition-bar" />
          </div>
        ) : null}

        {error ? <div className="signipedia-recognition-error">{error}</div> : null}

        {result ? (
          <section className="signipedia-recognition-result">
            <div className="signipedia-recognition-summary">
              <Sparkles size={16} />
              <p>{result.summary}</p>
            </div>

            {lowConfidenceMessage ? (
              <p className="signipedia-recognition-low">
                {lowConfidenceMessage}
              </p>
            ) : null}

            {redirectTarget ? (
              <p className="signipedia-recognition-redirect">
                Coincidencia alta detectada. Redirigiendo automáticamente...
              </p>
            ) : null}

            {result.matches.length > 0 ? (
              <ul className="signipedia-recognition-list">
                {result.matches.map((match) => (
                  <li key={match.slug}>
                    <button type="button" onClick={() => router.push(`/simbolo/${match.slug}`)}>
                      <strong>{match.glyph} {match.name}</strong>
                      <span>{confidenceLabel(match.confidence)}</span>
                    </button>
                    <small>{match.reason}</small>
                  </li>
                ))}
              </ul>
            ) : null}

            {result.matches.length === 0 && !result.lowConfidence ? (
              <p className="signipedia-recognition-low">No se encontraron coincidencias en la base de datos.</p>
            ) : null}

            {result.candidates.length > 1 ? (
              <div className="signipedia-recognition-alt">
                <p>Posibles interpretaciones visuales de la IA:</p>
                <ul>
                  {result.candidates.map((candidate, index) => (
                    <li key={`${candidate.name}-${index}`}>
                      {candidate.glyph ? `${candidate.glyph} ` : ""}
                      {candidate.name} ({confidenceLabel(candidate.confidence)})
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        <footer className="signipedia-recognition-foot">
          <button type="button" className="btn btn-secondary btn-md" onClick={onClose}>Cerrar</button>
          <button
            type="button"
            className="btn btn-primary btn-md"
            onClick={() => {
              void recognize();
            }}
            disabled={!preparedFile || isAnalyzing || isPreparing}
          >
            Analizar símbolo
          </button>
        </footer>
      </div>
    </div>
  );
}
