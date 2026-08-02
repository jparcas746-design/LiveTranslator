import { NextResponse } from "next/server";
import { getSignipediaEngine } from "@/thor/signipedia/engine";
import { jsonError, readJsonBody } from "@/app/api/_signipedia";
import { requireAdmin } from "@/thor/utils/adminAuth";
import { normalizeCatalogImportDocument, parseSignipediaCsvImport, type SignipediaImportDocument, type SignipediaImportFormat } from "@/thor/signipedia/import";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) {
    return denied;
  }

  const engine = getSignipediaEngine();
  const [categories, symbols, stats] = await Promise.all([engine.listCategories(), engine.listSymbols({ limit: 200 }), engine.getStats()]);

  return NextResponse.json({
    summary: stats,
    items: {
      categories,
      symbols,
    },
  });
}

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) {
    return denied;
  }

  try {
    const body = await readJsonBody<Record<string, unknown>>(request);
    const engine = getSignipediaEngine();
    const format = String(body.format || "json") as SignipediaImportFormat;

    if (format === "csv") {
      const csv = String(body.csv || body.content || "");
      if (!csv.trim()) {
        return jsonError("csv content is required for CSV imports", 400);
      }

      await engine.importCatalog(parseSignipediaCsvImport(csv));
      return NextResponse.json({ ok: true, format: "csv" });
    }

    if (Array.isArray(body.categories) || Array.isArray(body.symbols) || body.document) {
      await engine.importCatalog(
        normalizeCatalogImportDocument(
          body.document && typeof body.document === "object"
            ? (body.document as SignipediaImportDocument)
            : {
                categories: Array.isArray(body.categories) ? body.categories : [],
                symbols: Array.isArray(body.symbols) ? body.symbols : [],
                aliases: Array.isArray(body.aliases) ? body.aliases : [],
                tags: Array.isArray(body.tags) ? body.tags : [],
                synonyms: Array.isArray(body.synonyms) ? body.synonyms : [],
                relatedSymbols: Array.isArray(body.relatedSymbols) ? body.relatedSymbols : [],
                historicalPeriods: Array.isArray(body.historicalPeriods) ? body.historicalPeriods : [],
                sources: Array.isArray(body.sources) ? body.sources : [],
                media: Array.isArray(body.media) ? body.media : [],
                translations: Array.isArray(body.translations) ? body.translations : [],
                favorites: Array.isArray(body.favorites) ? body.favorites : [],
              }
        )
      );

      return NextResponse.json({ ok: true, format: "json" });
    }

    return jsonError("Unsupported admin action", 400);
  } catch (error) {
    return jsonError("Unable to execute admin action", 500, error instanceof Error ? error.message : String(error));
  }
}
