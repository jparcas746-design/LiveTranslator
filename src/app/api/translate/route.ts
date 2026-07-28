import { NextResponse } from "next/server";
import { routeThorRequest } from "@/ai/router";

function nowIso() {
  return new Date().toISOString();
}

function buildRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeSessionId(raw: string | null | undefined) {
  const value = (raw || "").trim();
  if (value) {
    return value;
  }

  return "default-session";
}

export async function POST(req: Request) {
  const requestId = buildRequestId();

  try {
    const payload = await req.json();

    const sessionId = normalizeSessionId(
      req.headers.get("x-thor-session") || req.headers.get("x-session-id") || payload?.sessionId
    );

    const result = await routeThorRequest({
      requestId,
      sessionId,
      messages: Array.isArray(payload?.messages) ? payload.messages : [],
      responseStyle:
        payload?.responseStyle === "formal" ||
        payload?.responseStyle === "balanced" ||
        payload?.responseStyle === "casual"
          ? payload.responseStyle
          : "balanced",
      translationMode: Boolean(payload?.translationMode),
      dictionaryMode: Boolean(payload?.dictionaryMode),
      webSearch: Boolean(payload?.webSearch),
      sourceLanguage: typeof payload?.sourceLanguage === "string" ? payload.sourceLanguage : "auto",
      targetLanguage: typeof payload?.targetLanguage === "string" ? payload.targetLanguage : "en-US",
      text: typeof payload?.text === "string" ? payload.text : "",
    });

    return NextResponse.json({
      response: result.response,
      cached: result.cached,
      intent: result.intent,
      provider: result.usedProvider,
      command: result.command,
    });
  } catch (error) {
    const details =
      error instanceof Error
        ? {
            message: error.message,
            stack: error.stack,
            details: (error as Error & { details?: unknown }).details,
          }
        : {
            message: String(error),
          };

    console.error("THORAI ROUTE ERROR", {
      requestId,
      details,
      time: nowIso(),
    });

    return NextResponse.json(
      {
        error:
          "No se pudo completar la solicitud. Todos los proveedores fallaron o la consulta no pudo procesarse.",
        details,
      },
      {
        status: 502,
      }
    );
  }
}
