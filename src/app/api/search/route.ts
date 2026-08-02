import { NextResponse } from "next/server";
import { getSignipediaEngine } from "@/thor/signipedia/engine";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") || undefined;
  const categorySlug = url.searchParams.get("category") || undefined;
  const tag = url.searchParams.get("tag") || undefined;
  const language = url.searchParams.get("language") || undefined;
  const limit = Number(url.searchParams.get("limit") || "24");
  const offset = Number(url.searchParams.get("offset") || "0");

  const engine = getSignipediaEngine();
  const [items, total] = await Promise.all([engine.listSymbols({
    query,
    categorySlug,
    tag,
    language,
    limit,
    offset,
    fuzzy: true,
  }), engine.countSymbols({
    query,
    categorySlug,
    tag,
    language,
    limit,
    offset,
    fuzzy: true,
  })]);

  return NextResponse.json({ items, total });
}
