import type { EmbeddingProvider } from "@/thor/knowledge/types";

function normalizeVector(values: number[], dimensions: number) {
  if (values.length === dimensions) {
    return values;
  }

  if (values.length > dimensions) {
    return values.slice(0, dimensions);
  }

  return [...values, ...new Array(dimensions - values.length).fill(0)];
}

export class HashEmbeddingProvider implements EmbeddingProvider {
  name = "hash";
  dimensions: number;

  constructor(dimensions = 768) {
    this.dimensions = dimensions;
  }

  async embedText(text: string) {
    const vector = new Array(this.dimensions).fill(0);
    const normalized = text.toLowerCase().trim();

    for (let index = 0; index < normalized.length; index += 1) {
      const code = normalized.charCodeAt(index);
      const slot = (code + index) % this.dimensions;
      vector[slot] += (code % 31) / 31;
    }

    return normalizeVector(vector, this.dimensions);
  }

  async embedBatch(texts: string[]) {
    return Promise.all(texts.map((text) => this.embedText(text)));
  }
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  name = "ollama";
  dimensions: number;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(input?: { baseUrl?: string; model?: string; dimensions?: number }) {
    this.baseUrl = input?.baseUrl || process.env.THOR_OLLAMA_URL || "http://127.0.0.1:11434";
    this.model = input?.model || process.env.THOR_OLLAMA_EMBED_MODEL || "nomic-embed-text";
    this.dimensions = input?.dimensions || Number(process.env.THOR_EMBED_DIM || 768);
  }

  async embedText(text: string) {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama embedding request failed with status ${response.status}`);
    }

    const data = (await response.json()) as { embedding?: number[] };
    if (!data.embedding || !Array.isArray(data.embedding)) {
      throw new Error("Ollama did not return a valid embedding vector");
    }

    return normalizeVector(data.embedding, this.dimensions);
  }

  async embedBatch(texts: string[]) {
    const vectors: number[][] = [];

    for (const text of texts) {
      vectors.push(await this.embedText(text));
    }

    return vectors;
  }
}

export function resolveEmbeddingProvider() {
  const provider = process.env.THOR_EMBEDDINGS_PROVIDER || "hash";

  if (provider === "ollama") {
    return new OllamaEmbeddingProvider();
  }

  return new HashEmbeddingProvider(Number(process.env.THOR_EMBED_DIM || 768));
}
