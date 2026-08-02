"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImageUp, Loader2, Sparkles, X } from "lucide-react";
import { CLIP_VISION_MODEL_ID } from "@/thor/signipedia/recognition/clipConfig";
import { normalizeL2, VISION_EMBEDDING_DIMENSIONS } from "@/thor/signipedia/recognition/vectorMath";

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

type ClipRuntime = {
  modelId: string;
  processor: (input: unknown) => Promise<Record<string, unknown>>;
  model: (inputs: Record<string, unknown>) => Promise<Record<string, unknown>>;
  RawImage: {
    fromBlob: (blob: Blob) => Promise<unknown>;
  };
};

function confidenceLabel(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

async function canvasFromImageBitmap(bitmap: ImageBitmap, mimeType: string) {
  const maxDimension = 1600;
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to initialize canvas context");
  }

  context.drawImage(bitmap, 0, 0, width, height);

  const outputType = mimeType === "image/png" ? "image/png" : "image/jpeg";
  const quality = outputType === "image/jpeg" ? 0.84 : undefined;

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) {
        reject(new Error("Unable to create compressed image"));
        return;
      }

      resolve(result);
    }, outputType, quality);
  });

  return { blob, outputType };
}

async function preprocessImage(file: File) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" as ImageOrientation });
    const { blob, outputType } = await canvasFromImageBitmap(bitmap, file.type);
    bitmap.close();

    const extension = outputType === "image/png" ? "png" : "jpg";
    const fileName = file.name.replace(/\.[a-z0-9]+$/i, "") || "symbol";

    return new File([blob], `${fileName}-optimized.${extension}`, { type: outputType });
  } catch {
    return file;
  }
}

export function SymbolRecognitionModal({ open, onClose }: SymbolRecognitionModalProps) {
  const router = useRouter();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const autoRedirectTimerRef = useRef<number | null>(null);
  const clipRuntimeRef = useRef<ClipRuntime | null>(null);

  const [source, setSource] = useState<RecognitionSource | null>(null);
  const [preparedFile, setPreparedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [redirectTarget, setRedirectTarget] = useState<string | null>(null);

  const heading = useMemo(() => {
    if (isPreparing) return "Preparando imagen";
    if (isAnalyzing) return "Analizando símbolo...";
    if (result) return "Resultado del reconocimiento";
    return "Reconocer símbolo con IA";
  }, [isAnalyzing, isPreparing, result]);

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
      setIsPreparing(false);
      setIsAnalyzing(false);
      setError(null);
      setResult(null);
      setRedirectTarget(null);
      if (autoRedirectTimerRef.current) {
        window.clearTimeout(autoRedirectTimerRef.current);
        autoRedirectTimerRef.current = null;
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
    setIsPreparing(true);

    try {
      const optimized = await preprocessImage(file);
      setPreparedFile(optimized);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(URL.createObjectURL(optimized));
    } catch (preprocessError) {
      setError(preprocessError instanceof Error ? preprocessError.message : "No se pudo procesar la imagen seleccionada.");
    } finally {
      setIsPreparing(false);
    }
  }

  async function recognize() {
    if (!preparedFile || !source) {
      return;
    }

    setError(null);
    setResult(null);
    setIsAnalyzing(true);

    const endpoint = source === "camera" ? "/api/recognition/camera" : "/api/recognition/image";
    const formData = new FormData();
    formData.set("image", preparedFile);

    async function loadClipRuntime() {
      if (clipRuntimeRef.current) {
        return clipRuntimeRef.current;
      }

      const transformers = await import("@huggingface/transformers");
      const { env, AutoProcessor, CLIPVisionModelWithProjection, RawImage } = transformers;

      env.allowLocalModels = false;
      env.useBrowserCache = true;

      const processor = await AutoProcessor.from_pretrained(CLIP_VISION_MODEL_ID);
      const model = await CLIPVisionModelWithProjection.from_pretrained(CLIP_VISION_MODEL_ID);

      clipRuntimeRef.current = {
        modelId: CLIP_VISION_MODEL_ID,
        processor: processor as ClipRuntime["processor"],
        model: model as ClipRuntime["model"],
        RawImage: RawImage as ClipRuntime["RawImage"],
      };

      return clipRuntimeRef.current;
    }

    try {
      try {
        const runtime = await loadClipRuntime();
        const rawImage = await runtime.RawImage.fromBlob(preparedFile);
        const processed = await runtime.processor(rawImage);
        const output = await runtime.model(processed);
        const tensor = output.image_embeds as { data?: Float32Array | number[] } | undefined;
        const values = tensor?.data ? Array.from(tensor.data) : [];

        if (values.length === VISION_EMBEDDING_DIMENSIONS) {
          const normalized = normalizeL2(values);
          if (normalized) {
            formData.set("imageEmbedding", JSON.stringify(normalized));
          }
        }
      } catch {
        // If local CLIP embedding fails, backend can still use provider-based recognition.
      }

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
      setIsAnalyzing(false);
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

        {isPreparing || isAnalyzing ? (
          <div className="signipedia-recognition-progress" role="status" aria-live="polite">
            <Loader2 size={16} className="spin" />
            <span>{isPreparing ? "Optimizando imagen para reconocimiento..." : "Analizando símbolo..."}</span>
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
