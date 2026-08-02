import { NextResponse } from "next/server";
import { getSignipediaEngine } from "@/thor/signipedia/engine";
import { jsonError, parseCategoryInput, readJsonBody } from "@/app/api/_signipedia";

export const runtime = "nodejs";

export async function GET() {
  const engine = getSignipediaEngine();
  const items = await engine.listCategories();
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<Record<string, unknown>>(request);
    const input = parseCategoryInput(body);

    if (!input.slug || !input.name) {
      return jsonError("slug and name are required", 400);
    }

    const engine = getSignipediaEngine();
    const item = await engine.upsertCategory(input);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return jsonError("Unable to create category", 500, error instanceof Error ? error.message : String(error));
  }
}
