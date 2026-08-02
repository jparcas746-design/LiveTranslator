import { NextResponse } from "next/server";
import { getSignipediaEngine } from "@/thor/signipedia/engine";
import { jsonError, parseCategoryInput, readJsonBody } from "@/app/api/_signipedia";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const engine = getSignipediaEngine();
  const item = await engine.getCategoryBySlug(slug);

  if (!item) {
    return jsonError("Category not found", 404);
  }

  return NextResponse.json({ item });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const engine = getSignipediaEngine();
  const existing = await engine.getCategoryBySlug(slug);

  if (!existing) {
    return jsonError("Category not found", 404);
  }

  try {
    const body = await readJsonBody<Record<string, unknown>>(request);
    const item = await engine.upsertCategory({
      ...parseCategoryInput({ ...body, slug }),
      slug,
    });
    return NextResponse.json({ item });
  } catch (error) {
    return jsonError("Unable to update category", 500, error instanceof Error ? error.message : String(error));
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const engine = getSignipediaEngine();
  const item = await engine.getCategoryBySlug(slug);

  if (!item) {
    return jsonError("Category not found", 404);
  }

  await engine.deleteCategory(item.id);
  return NextResponse.json({ ok: true });
}
