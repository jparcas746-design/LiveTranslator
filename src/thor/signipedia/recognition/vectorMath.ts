export const VISION_EMBEDDING_DIMENSIONS = 512;

export function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

export function normalizeL2(values: number[]) {
  let squared = 0;
  for (const value of values) {
    squared += value * value;
  }

  const norm = Math.sqrt(squared);
  if (!Number.isFinite(norm) || norm === 0) {
    return null;
  }

  return values.map((value) => value / norm);
}

export function cosineSimilarityNormalized(a: number[], b: number[]) {
  if (a.length !== b.length || a.length === 0) {
    return NaN;
  }

  let dot = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
  }

  return dot;
}
