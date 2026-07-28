import { NextResponse } from "next/server";
import { getKnowledgeEngine } from "@/thor/brain/knowledgeEngine";
import { requireAdmin } from "@/thor/utils/adminAuth";
import { toApiError } from "@/thor/utils/httpErrors";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  console.log("ADMIN_KNOWLEDGE_DELETE_START", { time: new Date().toISOString() });
  const denied = requireAdmin(request);
  if (denied) {
    console.warn("ADMIN_KNOWLEDGE_DELETE_DENIED", { time: new Date().toISOString() });
    return denied;
  }

  try {
    const { documentId } = await context.params;
    const engine = getKnowledgeEngine();
    await engine.deleteDocument(documentId);

    console.log("ADMIN_KNOWLEDGE_DELETE_OK", { documentId, time: new Date().toISOString() });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("ADMIN_KNOWLEDGE_DELETE_ERROR", {
      error: toApiError(error),
      time: new Date().toISOString(),
    });
    return NextResponse.json({ error: toApiError(error) }, { status: 503 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  console.log("ADMIN_KNOWLEDGE_PATCH_START", { time: new Date().toISOString() });
  const denied = requireAdmin(request);
  if (denied) {
    console.warn("ADMIN_KNOWLEDGE_PATCH_DENIED", { time: new Date().toISOString() });
    return denied;
  }

  try {
    const { documentId } = await context.params;
    const body = (await request.json()) as { category?: string };

    if (!body.category || !body.category.trim()) {
      return NextResponse.json({ error: "category is required" }, { status: 400 });
    }

    const engine = getKnowledgeEngine();
    const document = await engine.updateDocumentCategory(documentId, body.category.trim());

    console.log("ADMIN_KNOWLEDGE_PATCH_OK", {
      documentId,
      category: body.category.trim(),
      time: new Date().toISOString(),
    });

    return NextResponse.json({ document });
  } catch (error) {
    console.error("ADMIN_KNOWLEDGE_PATCH_ERROR", {
      error: toApiError(error),
      time: new Date().toISOString(),
    });
    return NextResponse.json({ error: toApiError(error) }, { status: 503 });
  }
}
