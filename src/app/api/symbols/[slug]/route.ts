import { NextResponse } from "next/server";
import { getSignipediaEngine } from "@/thor/signipedia/engine";
import { jsonError, parseMediaInput, parsePeriodsInput, parseRelatedInput, parseSourceInput, parseStringArray, parseSymbolInput, parseTranslationsInput, readJsonBody } from "@/app/api/_signipedia";
import { thorLogger } from "@/thor/utils/logger";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const engine = getSignipediaEngine();
  const symbol = await engine.getSymbolDetailBySlug(slug);

  if (!symbol) {
    return jsonError("Symbol not found", 404);
  }

  thorLogger.info("api.symbols.detail", "Symbol detail image URL readback", {
    slug,
    symbolId: symbol.symbol.id,
    imageUrl: symbol.symbol.imageUrl,
    firstMediaImageUrl: symbol.media.find((item) => item.kind === "image")?.url || null,
  });

  return NextResponse.json(
    { item: symbol },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
  );
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
      const parsedMedia = parseMediaInput(body.media);
      const requestedMediaUrl = parsedMedia.find((item) => item.kind === "image")?.url || null;
      thorLogger.info("api.symbols.patch", "Media update requested", {
        slug,
        symbolId: updated.id,
        requestedMediaUrl,
      });

      const savedMedia = await engine.setMedia(updated.id, parsedMedia);
      const savedMediaUrl = savedMedia.find((item) => item.kind === "image")?.url || null;

      const readback = await engine.getSymbolDetailById(updated.id);
      const readbackUrl =
        readback?.symbol.imageUrl ||
        readback?.media.find((item) => item.kind === "image")?.url ||
        null;

      thorLogger.info("api.symbols.patch", "Media update persisted", {
        slug,
        symbolId: updated.id,
        savedMediaUrl,
        readbackUrl,
      });
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
