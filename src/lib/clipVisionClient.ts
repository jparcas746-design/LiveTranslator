import { CLIP_VISION_MODEL_ID } from "@/thor/signipedia/recognition/clipConfig";
import { normalizeL2 } from "@/thor/signipedia/recognition/vectorMath";

type ClipRuntime = {
  modelId: string;
  processor: (input: unknown) => Promise<Record<string, unknown>>;
  model: (inputs: Record<string, unknown>) => Promise<Record<string, unknown>>;
  RawImage: {
    fromBlob: (blob: Blob) => Promise<unknown>;
  };
};

export type ClipEmbeddingReport = {
  dims: number[];
  length: number;
  preview: number[];
  vector: number[];
};

type OptimizeImageOptions = {
  maxDimension?: number;
  quality?: number;
  maxBytes?: number;
};

let runtime: ClipRuntime | null = null;

export async function loadClipVisionRuntime() {
  if (runtime) {
    return runtime;
  }

  const transformers = await import("@huggingface/transformers");
  const { env, AutoProcessor, CLIPVisionModelWithProjection, RawImage } = transformers;

  env.allowLocalModels = false;
  env.useBrowserCache = true;

  const processor = await AutoProcessor.from_pretrained(CLIP_VISION_MODEL_ID);
  const model = await CLIPVisionModelWithProjection.from_pretrained(CLIP_VISION_MODEL_ID);

  runtime = {
    modelId: CLIP_VISION_MODEL_ID,
    processor: processor as ClipRuntime["processor"],
    model: model as ClipRuntime["model"],
    RawImage: RawImage as ClipRuntime["RawImage"],
  };

  return runtime;
}

export async function generateClipImageEmbedding(file: Blob): Promise<ClipEmbeddingReport> {
  const clip = await loadClipVisionRuntime();
  const rawImage = await clip.RawImage.fromBlob(file);
  const processed = await clip.processor(rawImage);
  const output = await clip.model(processed);

  const embeddingTensor = output.image_embeds as
    | { data?: Float32Array | number[]; dims?: number[] }
    | undefined;

  if (!embeddingTensor?.data) {
    throw new Error("La salida no contiene image_embeds.");
  }

  const vector = Array.from(embeddingTensor.data);
  const normalized = normalizeL2(vector);
  if (!normalized) {
    throw new Error("No se pudo normalizar el embedding.");
  }

  return {
    dims: Array.isArray(embeddingTensor.dims) ? embeddingTensor.dims : [vector.length],
    length: vector.length,
    preview: vector.slice(0, 12).map((value) => Number(value.toFixed(6))),
    vector: normalized,
  };
}

export function isClipRuntimeLoaded() {
  return Boolean(runtime);
}

async function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

export async function optimizeImageForVision(file: File, options?: OptimizeImageOptions) {
  const maxDimension = options?.maxDimension ?? 768;
  const initialQuality = options?.quality ?? 0.82;
  const targetMaxBytes = options?.maxBytes ?? 1_200_000;

  if (typeof window === "undefined" || typeof createImageBitmap === "undefined") {
    return file;
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" as ImageOrientation });
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      return file;
    }

    context.drawImage(bitmap, 0, 0, width, height);

    const qualitySteps = [
      initialQuality,
      Math.max(0.7, initialQuality - 0.08),
      Math.max(0.62, initialQuality - 0.16),
      0.55,
    ];

    for (const quality of qualitySteps) {
      const webpBlob = await canvasToBlob(canvas, "image/webp", quality);
      if (webpBlob && webpBlob.size <= targetMaxBytes) {
        const fileName = file.name.replace(/\.[a-z0-9]+$/i, "") || "symbol";
        return new File([webpBlob], `${fileName}-optimized.webp`, { type: "image/webp" });
      }

      const jpegBlob = await canvasToBlob(canvas, "image/jpeg", quality);
      if (jpegBlob && jpegBlob.size <= targetMaxBytes) {
        const fileName = file.name.replace(/\.[a-z0-9]+$/i, "") || "symbol";
        return new File([jpegBlob], `${fileName}-optimized.jpg`, { type: "image/jpeg" });
      }
    }

    const fallbackBlob = (await canvasToBlob(canvas, "image/jpeg", 0.5)) || (await canvasToBlob(canvas, "image/webp", 0.5));
    if (!fallbackBlob) {
      return file;
    }

    const fallbackName = file.name.replace(/\.[a-z0-9]+$/i, "") || "symbol";
    const extension = fallbackBlob.type === "image/webp" ? "webp" : "jpg";
    return new File([fallbackBlob], `${fallbackName}-optimized.${extension}`, { type: fallbackBlob.type || "image/jpeg" });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}
