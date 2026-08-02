import { NextResponse } from "next/server";
import { getSignipediaEngine } from "@/thor/signipedia/engine";
import { jsonError, parseMediaInput, parsePeriodsInput, parseRelatedInput, parseSourceInput, parseStringArray, parseSymbolInput, parseTranslationsInput, readJsonBody } from "@/app/api/_signipedia";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const engine = getSignipediaEngine();
  const symbol = await engine.getSymbolDetailBySlug(slug);

  if (!symbol) {
    return jsonError("Symbol not found", 404);
  }

  return NextResponse.json({ item: symbol });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const body = (await readJsonBody<Record<string, unknown>>(request)) || {};
    const engine = getSignipediaEngine();
    const existing = await engine.getSymbolBySlug(slug);

    if (!existing) {
      return jsonError("Symbol not found", 404);
    }

    const updated = await engine.updateSymbol(existing.id, {
      ...parseSymbolInput({ ...body, slug }),
      slug,
    });

    if (!updated) {
      return jsonError("Unable to update symbol", 500);
    }

    if (Array.isArray(body.aliases)) {
      await engine.setAliases(updated.id, parseStringArray(body.aliases), updated.language);
    }
    if (Array.isArray(body.synonyms)) {
      await engine.setSynonyms(updated.id, parseStringArray(body.synonyms), updated.language);
    }
    if (Array.isArray(body.tags)) {
      await engine.setTags(updated.id, parseStringArray(body.tags), updated.language);
    }
    if (Array.isArray(body.relatedSymbols)) {
      await engine.setRelatedSymbols(updated.id, parseRelatedInput(body.relatedSymbols));
    }
    if (Array.isArray(body.historicalPeriods)) {
      await engine.setHistoricalPeriods(updated.id, parsePeriodsInput(body.historicalPeriods));
    }
    if (Array.isArray(body.sources)) {
      await engine.setSources(updated.id, parseSourceInput(body.sources));
    }
    if (Array.isArray(body.media)) {
      await engine.setMedia(updated.id, parseMediaInput(body.media));
    }
    if (Array.isArray(body.translations)) {
      await engine.setTranslations(updated.id, parseTranslationsInput(body.translations));
    }

    return NextResponse.json({ item: updated });
  } catch (error) {
    return jsonError("Unable to update symbol", 500, error instanceof Error ? error.message : String(error));
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const engine = getSignipediaEngine();
  const symbol = await engine.getSymbolBySlug(slug);

  if (!symbol) {
    return jsonError("Symbol not found", 404);
  }

  await engine.deleteSymbol(symbol.id);
  return NextResponse.json({ ok: true });
}
