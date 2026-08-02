import type { SymbolVisionProvider, VisionRecognitionOutput, VisionSymbolCandidate } from "@/thor/signipedia/recognition/types";

const DEFAULT_GEMINI_MODELS = (process.env.THOR_SYMBOL_VISION_MODEL || "gemini-2.5-flash-lite,gemini-2.0-flash")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

function logRecognition(stage: string, traceId?: string, details?: Record<string, unknown>) {
  const scope = traceId || "no-trace";
  console.info(`[recognition][${scope}] ${stage}`, details || {});
}

function clampConfidence(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(0, Math.min(1, numeric));
}

function sanitizeText(value: unknown, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim();
}

function sanitizeCandidate(value: unknown): VisionSymbolCandidate | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const name = sanitizeText(raw.name);
  if (!name) {
    return null;
  }

  const aliases = Array.isArray(raw.aliases)
    ? raw.aliases.map((item) => sanitizeText(item)).filter(Boolean)
    : [];

  return {
    name,
    slug: sanitizeText(raw.slug) || undefined,
    glyph: sanitizeText(raw.glyph) || undefined,
    confidence: clampConfidence(raw.confidence),
    aliases,
    meaning: sanitizeText(raw.meaning) || undefined,
    description: sanitizeText(raw.description) || undefined,
    context: sanitizeText(raw.context) || undefined,
  };
}

function extractJsonBlock(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced) {
    return fenced[1].trim();
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1).trim();
  }

  return text.trim();
}

function normalizeVisionOutput(rawText: string, provider: string): VisionRecognitionOutput {
  const parsedBlock = extractJsonBlock(rawText);
  let parsed: Record<string, unknown> | null = null;

  try {
    parsed = JSON.parse(parsedBlock) as Record<string, unknown>;
  } catch {
    parsed = null;
  }

  const candidatesRaw = parsed && Array.isArray(parsed.candidates) ? parsed.candidates : [];
  const candidates = candidatesRaw
    .map((item) => sanitizeCandidate(item))
    .filter((item): item is VisionSymbolCandidate => Boolean(item))
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 8);

  const lowConfidence = typeof parsed?.lowConfidence === "boolean"
    ? parsed.lowConfidence
    : candidates.length === 0 || candidates[0].confidence < 0.45;

  const summary = sanitizeText(parsed?.summary, "No se pudo extraer un resumen del análisis visual.");

  return {
    provider,
    summary,
    candidates,
    lowConfidence,
  };
}

class GeminiSymbolVisionProvider implements SymbolVisionProvider {
  name = "gemini";

  isConfigured() {
    return Boolean(process.env.GEMINI_API_KEY?.trim());
  }

  async recognize(input: { mimeType: string; imageBase64: string; traceId?: string }) {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      logRecognition("provider_missing_api_key", input.traceId, { provider: this.name });
      throw new Error("GEMINI_API_KEY is not configured");
    }

    logRecognition("provider_request_start", input.traceId, {
      provider: this.name,
      mimeType: input.mimeType,
      imageBase64Length: input.imageBase64.length,
      configuredModels: DEFAULT_GEMINI_MODELS,
    });

    const prompt = [
      "Analiza esta imagen e identifica símbolos visuales con enfoque enciclopédico.",
      "Responde SOLO JSON válido con esta estructura:",
      "{",
      '  "summary": "resumen breve",',
      '  "lowConfidence": false,',
      '  "candidates": [',
      "    {",
      '      "name": "Nombre más probable",',
      '      "slug": "slug-candidato-opcional",',
      '      "glyph": "carácter o glifo si aplica",',
      '      "confidence": 0.0,',
      '      "aliases": ["alias 1", "alias 2"],',
      '      "meaning": "significado breve",',
      '      "description": "descripción breve",',
      '      "context": "contexto de uso"',
      "    }",
      "  ]",
      "}",
      "Requisitos:",
      "- confidence entre 0 y 1",
      "- máximo 5 candidatos",
      "- si no hay certeza, lowConfidence=true y confidence bajo",
      "- no añadas texto fuera del JSON",
    ].join("\n");

    let lastError = "";

    for (const model of DEFAULT_GEMINI_MODELS) {
      logRecognition("provider_model_attempt", input.traceId, { model });
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: input.mimeType,
                    data: input.imageBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.15,
            topP: 0.9,
            responseMimeType: "application/json",
          },
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        lastError = `Gemini model ${model} failed (${response.status}): ${body.slice(0, 240)}`;
        logRecognition("provider_model_failed", input.traceId, {
          model,
          status: response.status,
          body,
        });

        if (response.status === 404 || response.status === 400) {
          continue;
        }

        throw new Error(lastError);
      }

      const payload = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };

      const rawText = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
      logRecognition("provider_model_success", input.traceId, {
        model,
        responseCandidates: payload.candidates?.length || 0,
      });

      logRecognition("provider_raw_response", input.traceId, {
        model,
        rawText,
      });

      const normalized = normalizeVisionOutput(rawText, `${this.name}:${model}`);
      logRecognition("provider_normalized_output", input.traceId, {
        model,
        summary: normalized.summary,
        lowConfidence: normalized.lowConfidence,
        candidateCount: normalized.candidates.length,
        candidates: normalized.candidates,
      });

      return normalized;
    }

    logRecognition("provider_exhausted_models", input.traceId, {
      lastError,
      attemptedModels: DEFAULT_GEMINI_MODELS,
    });
    throw new Error(lastError || "No compatible Gemini model is available for symbol recognition");
  }
}

class NoopSymbolVisionProvider implements SymbolVisionProvider {
  name = "noop";

  isConfigured() {
    return true;
  }

  async recognize() {
    return {
      provider: this.name,
      summary: "No hay proveedor multimodal configurado.",
      lowConfidence: true,
      candidates: [],
    };
  }
}

export function resolveSymbolVisionProvider(): SymbolVisionProvider {
  const providerName = (process.env.THOR_SYMBOL_VISION_PROVIDER || "gemini").trim().toLowerCase();
  const gemini = new GeminiSymbolVisionProvider();

  if (providerName === "gemini") {
    return gemini.isConfigured() ? gemini : new NoopSymbolVisionProvider();
  }

  if (providerName === "noop") {
    return new NoopSymbolVisionProvider();
  }

  return gemini.isConfigured() ? gemini : new NoopSymbolVisionProvider();
}
