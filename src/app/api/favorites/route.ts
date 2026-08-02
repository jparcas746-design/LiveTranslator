import { NextResponse } from "next/server";
import { getSessionId, jsonError, readJsonBody } from "@/app/api/_signipedia";
import { getSignipediaEngine } from "@/thor/signipedia/engine";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const sessionId = getSessionId(request);
  const engine = getSignipediaEngine();
  const favorites = await engine.listFavorites(sessionId);
  return NextResponse.json({ items: favorites });
}

export async function POST(request: Request) {
  try {
    const sessionId = getSessionId(request);
    const body = await readJsonBody<Record<string, unknown>>(request);
    const symbolId = String(body.symbolId || body.slug || "").trim();

    if (!symbolId) {
      return jsonError("symbolId is required", 400);
    }

    const engine = getSignipediaEngine();
    const result = await engine.toggleFavorite(sessionId, symbolId);
    return NextResponse.json(result, { status: result.favorited ? 201 : 200 });
  } catch (error) {
    return jsonError("Unable to toggle favorite", 500, error instanceof Error ? error.message : String(error));
  }
}

export async function DELETE(request: Request) {
  try {
    const sessionId = getSessionId(request);
    const body = await readJsonBody<Record<string, unknown>>(request);
    const symbolId = String(body.symbolId || body.slug || "").trim();

    if (!symbolId) {
      return jsonError("symbolId is required", 400);
    }

    const engine = getSignipediaEngine();
    await engine.removeFavorite(sessionId, symbolId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError("Unable to remove favorite", 500, error instanceof Error ? error.message : String(error));
  }
}
