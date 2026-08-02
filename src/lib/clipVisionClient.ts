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
