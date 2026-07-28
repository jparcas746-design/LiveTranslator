import { NextResponse } from "next/server";
import { getKnowledgeEngine } from "@/thor/brain/knowledgeEngine";
import { requireAdmin } from "@/thor/utils/adminAuth";
import { toApiError } from "@/thor/utils/httpErrors";

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const denied = requireAdmin(request);
  if (denied) {
    return denied;
  }

  try {
    const { documentId } = await context.params;
    const engine = getKnowledgeEngine();
    await engine.deleteDocument(documentId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: toApiError(error) }, { status: 503 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const denied = requireAdmin(request);
  if (denied) {
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

    return NextResponse.json({ document });
  } catch (error) {
    return NextResponse.json({ error: toApiError(error) }, { status: 503 });
  }
}
