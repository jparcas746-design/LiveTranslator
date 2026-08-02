import { NextResponse } from "next/server";
import { getSignipediaEngine } from "@/thor/signipedia/engine";
import { jsonError, parseMediaInput, parsePeriodsInput, parseRelatedInput, parseSourceInput, parseStringArray, parseSymbolInput, parseTranslationsInput, readJsonBody } from "@/app/api/_signipedia";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") || undefined;
  const categorySlug = url.searchParams.get("category") || undefined;
  const tag = url.searchParams.get("tag") || undefined;
  const language = url.searchParams.get("language") || undefined;
  const limit = Number(url.searchParams.get("limit") || "50");
  const offset = Number(url.searchParams.get("offset") || "0");

  const engine = getSignipediaEngine();
  const results = await engine.listSymbols({
    query,
    categorySlug,
    tag,
    language,
    limit,
    offset,
    fuzzy: true,
  });

  return NextResponse.json(
    {
      items: results,
      total: results.length,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}

export async function POST(request: Request) {
  try {
    const body = (await readJsonBody<Record<string, unknown>>(request)) || {};
    const symbolInput = parseSymbolInput(body);

    if (!symbolInput.slug || !symbolInput.name || !symbolInput.categoryId) {
      return jsonError("slug, name and categoryId are required", 400);
    }

    const engine = getSignipediaEngine();
    const symbol = await engine.createSymbol(symbolInput);

    await engine.setAliases(symbol.id, parseStringArray(body.aliases), symbol.language);
    await engine.setSynonyms(symbol.id, parseStringArray(body.synonyms), symbol.language);
    await engine.setTags(symbol.id, parseStringArray(body.tags), symbol.language);
    await engine.setRelatedSymbols(symbol.id, parseRelatedInput(body.relatedSymbols));
    await engine.setHistoricalPeriods(symbol.id, parsePeriodsInput(body.historicalPeriods));
    await engine.setSources(symbol.id, parseSourceInput(body.sources));
    await engine.setMedia(symbol.id, parseMediaInput(body.media));
    await engine.setTranslations(symbol.id, parseTranslationsInput(body.translations));

    return NextResponse.json({ item: symbol }, { status: 201 });
  } catch (error) {
    return jsonError("Unable to create symbol", 500, error instanceof Error ? error.message : String(error));
  }
}
