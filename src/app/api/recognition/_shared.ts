import { NextResponse } from "next/server";
import { recognizeSymbolFromImage } from "@/thor/signipedia/recognition/service";
import { getSignipediaEngine } from "@/thor/signipedia/engine";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function logRecognition(stage: string, traceId: string, details?: Record<string, unknown>) {
  console.info(`[recognition][${traceId}] ${stage}`, details || {});
}

function parseOptionalImageEmbedding(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }

    const values = parsed
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item));

    return values.length > 0 ? values : null;
  } catch {
    return null;
  }
}

export async function handleRecognitionRequest(request: Request) {
  const traceId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  const formData = await request.formData();
  const file = formData.get("image");
  const imageEmbedding = parseOptionalImageEmbedding(formData.get("imageEmbedding"));

  if (!(file instanceof File)) {
    logRecognition("request_rejected_missing_file", traceId);
    return NextResponse.json({ error: "image file is required" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    logRecognition("request_rejected_invalid_mime", traceId, { mimeType: file.type });
    return NextResponse.json({ error: "Only image files are accepted" }, { status: 400 });
  }

  if (file.size > MAX_IMAGE_BYTES) {
    logRecognition("request_rejected_too_large", traceId, { sizeBytes: file.size, maxBytes: MAX_IMAGE_BYTES });
    return NextResponse.json({ error: "Image is too large. Maximum allowed size is 8MB." }, { status: 413 });
  }

  logRecognition("image_received", traceId, {
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    hasImageEmbedding: Boolean(imageEmbedding),
    embeddingDimensions: imageEmbedding?.length || 0,
  });

  const buffer = Buffer.from(await file.arrayBuffer());
  const imageBase64 = buffer.toString("base64");

  logRecognition("image_encoded_base64", traceId, {
    bufferBytes: buffer.length,
    base64Length: imageBase64.length,
  });

  try {
    logRecognition("vision_pipeline_start", traceId);
    const recognition = await recognizeSymbolFromImage({
      mimeType: file.type,
      imageBase64,
      imageEmbedding: imageEmbedding || undefined,
      traceId,
    });

    logRecognition("vision_pipeline_success", traceId, {
      provider: recognition.provider,
      lowConfidence: recognition.lowConfidence,
      candidates: recognition.candidates.length,
      matches: recognition.matches.length,
      bestMatch: recognition.bestMatch?.slug || null,
      shouldAutoRedirect: recognition.shouldAutoRedirect,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(recognition);
  } catch (error) {
    logRecognition("vision_pipeline_error", traceId, {
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    });

    const hint = file.name
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[_-]+/g, " ")
      .trim();

    const engine = getSignipediaEngine();
    const fallbackHits = hint
      ? await engine.listSymbols({ query: hint, fuzzy: true, language: "es", limit: 6 })
      : [];

    logRecognition("fallback_search_completed", traceId, {
      hint,
      fallbackHitCount: fallbackHits.length,
      fallbackSlugs: fallbackHits.map((item) => item.symbol.slug),
    });

    return NextResponse.json({
      provider: "fallback",
      summary: "No fue posible analizar visualmente la imagen con IA. Mostramos coincidencias aproximadas por nombre/contexto.",
      lowConfidence: true,
      candidates: hint
        ? [
            {
              name: hint,
              confidence: 0.2,
              aliases: [],
            },
          ]
        : [],
      matches: fallbackHits.map((hit, index) => ({
        slug: hit.symbol.slug,
        name: hit.symbol.name,
        glyph: hit.symbol.canonicalGlyph || "∎",
        confidence: Math.max(0.15, 0.55 - index * 0.08),
        meaning: hit.symbol.meaning,
        imageUrl: hit.symbol.imageUrl || null,
        categoryName: hit.category?.name || null,
        reason: "Coincidencia aproximada por contexto textual",
        sourceScore: hit.score,
      })),
      bestMatch: fallbackHits[0]
        ? {
            slug: fallbackHits[0].symbol.slug,
            name: fallbackHits[0].symbol.name,
            glyph: fallbackHits[0].symbol.canonicalGlyph || "∎",
            confidence: 0.55,
            meaning: fallbackHits[0].symbol.meaning,
            imageUrl: fallbackHits[0].symbol.imageUrl || null,
            categoryName: fallbackHits[0].category?.name || null,
            reason: "Coincidencia aproximada por contexto textual",
            sourceScore: fallbackHits[0].score,
          }
        : null,
      shouldAutoRedirect: false,
      analyzedAt: new Date().toISOString(),
    });
  }
}
