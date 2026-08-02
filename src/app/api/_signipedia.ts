import type { CategoryUpsertInput, SymbolStatus, SymbolUpsertInput } from "@/thor/signipedia/types";

export function getSessionId(request: Request) {
  return (
    request.headers.get("x-signipedia-session") ||
    request.headers.get("x-session-id") ||
    request.headers.get("x-thor-session") ||
    "anonymous"
  ).trim() || "anonymous";
}

export async function readJsonBody<T>(request: Request): Promise<T> {
  const text = await request.text();
  if (!text.trim()) {
    return {} as T;
  }

  return JSON.parse(text) as T;
}

export function jsonError(message: string, status = 400, details?: unknown) {
  return Response.json({ error: message, details }, { status });
}

export function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value.map((entry) => String(entry || "")).map((entry) => entry.trim()).filter(Boolean);
}

export function parseCategoryInput(body: Record<string, unknown>): CategoryUpsertInput {
  return {
    slug: String(body.slug || body.id || "").trim(),
    name: String(body.name || "").trim(),
    description: String(body.description || "").trim(),
    icon: body.icon === null ? null : String(body.icon || "").trim() || null,
    parentId: body.parentId === null ? null : String(body.parentId || "").trim() || null,
    orderIndex: Number.isFinite(Number(body.orderIndex)) ? Number(body.orderIndex) : 0,
  };
}

export function parseSymbolInput(body: Record<string, unknown>): SymbolUpsertInput {
  return {
    slug: String(body.slug || "").trim(),
    name: String(body.name || "").trim(),
    meaning: String(body.meaning || "").trim(),
    history: String(body.history || "").trim(),
    origin: String(body.origin || "").trim(),
    currentUses: String(body.currentUses || body.current_uses || "").trim(),
    categoryId: String(body.categoryId || body.category_id || "").trim(),
    status: normalizeStatus(body.status),
    isFeatured: Boolean(body.isFeatured ?? body.is_featured),
    description: String(body.description || body.meaning || "").trim(),
    canonicalGlyph: String(body.canonicalGlyph || body.canonical_glyph || "").trim(),
    language: String(body.language || "es").trim() || "es",
  };
}

export function normalizeStatus(value: unknown): SymbolStatus {
  const normalized = String(value || "draft").trim();
  if (normalized === "review" || normalized === "published" || normalized === "archived") {
    return normalized;
  }
  return "draft";
}

export function parseRelatedInput(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Array<{ relatedSymbolId: string; relationType?: "related" | "similar" | "historical" | "semantic" }>;
  }

  return value
    .map((entry) => {
      if (typeof entry === "string") {
        return { relatedSymbolId: entry.trim(), relationType: "related" as const };
      }

      return {
        relatedSymbolId: String((entry as { relatedSymbolId?: unknown }).relatedSymbolId || "").trim(),
        relationType:
          (entry as { relationType?: unknown }).relationType === "similar" ||
          (entry as { relationType?: unknown }).relationType === "historical" ||
          (entry as { relationType?: unknown }).relationType === "semantic"
            ? ((entry as { relationType?: unknown }).relationType as "related" | "similar" | "historical" | "semantic")
            : "related",
      };
    })
    .filter((entry) => Boolean(entry.relatedSymbolId));
}

export function parsePeriodsInput(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Array<{ label: string; startYear: number | null; endYear: number | null; description: string }>;
  }

  return value
    .map((entry) => ({
      label: String((entry as { label?: unknown }).label || "").trim(),
      startYear: Number.isFinite(Number((entry as { startYear?: unknown }).startYear))
        ? Number((entry as { startYear?: unknown }).startYear)
        : null,
      endYear: Number.isFinite(Number((entry as { endYear?: unknown }).endYear))
        ? Number((entry as { endYear?: unknown }).endYear)
        : null,
      description: String((entry as { description?: unknown }).description || "").trim(),
    }))
    .filter((entry) => Boolean(entry.label));
}

export function parseSourceInput(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Array<{ title: string; url: string | null; author: string | null; publishedAt: string | null; citation: string | null }>;
  }

  return value
    .map((entry) => ({
      title: String((entry as { title?: unknown }).title || "").trim(),
      url: String((entry as { url?: unknown }).url || "").trim() || null,
      author: String((entry as { author?: unknown }).author || "").trim() || null,
      publishedAt: String((entry as { publishedAt?: unknown }).publishedAt || "").trim() || null,
      citation: String((entry as { citation?: unknown }).citation || "").trim() || null,
    }))
    .filter((entry) => Boolean(entry.title));
}

export function parseMediaInput(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Array<{ kind: "image" | "video" | "audio" | "document"; url: string; altText: string | null; credit: string | null; width: number | null; height: number | null; sortOrder: number }>;
  }

  return value
    .map((entry) => {
      if (typeof entry === "string") {
        return {
          kind: "image" as const,
          url: entry.trim(),
          altText: null,
          credit: null,
          width: null,
          height: null,
          sortOrder: 0,
        };
      }

      return {
        kind:
          (entry as { kind?: unknown }).kind === "video" ||
          (entry as { kind?: unknown }).kind === "audio" ||
          (entry as { kind?: unknown }).kind === "document"
            ? ((entry as { kind?: unknown }).kind as "image" | "video" | "audio" | "document")
            : "image",
        url: String((entry as { url?: unknown }).url || "").trim(),
        altText: String((entry as { altText?: unknown }).altText || "").trim() || null,
        credit: String((entry as { credit?: unknown }).credit || "").trim() || null,
        width: Number.isFinite(Number((entry as { width?: unknown }).width)) ? Number((entry as { width?: unknown }).width) : null,
        height: Number.isFinite(Number((entry as { height?: unknown }).height)) ? Number((entry as { height?: unknown }).height) : null,
        sortOrder: Number.isFinite(Number((entry as { sortOrder?: unknown }).sortOrder)) ? Number((entry as { sortOrder?: unknown }).sortOrder) : 0,
      };
    })
    .filter((entry) => Boolean(entry.url));
}

export function parseTranslationsInput(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Array<{ language: string; field: "name" | "meaning" | "history" | "origin" | "currentUses"; value: string }>;
  }

  return value
    .map((entry) => ({
      language: String((entry as { language?: unknown }).language || "").trim(),
      field:
        (entry as { field?: unknown }).field === "name" ||
        (entry as { field?: unknown }).field === "meaning" ||
        (entry as { field?: unknown }).field === "history" ||
        (entry as { field?: unknown }).field === "origin" ||
        (entry as { field?: unknown }).field === "currentUses"
          ? ((entry as { field?: unknown }).field as "name" | "meaning" | "history" | "origin" | "currentUses")
          : "meaning",
      value: String((entry as { value?: unknown }).value || "").trim(),
    }))
    .filter((entry) => Boolean(entry.language && entry.value));
}
