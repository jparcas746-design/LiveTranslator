import { NextResponse } from "next/server";
import { getKnowledgeEngine } from "@/thor/brain/knowledgeEngine";
import { requireAdmin } from "@/thor/utils/adminAuth";
import { toApiError } from "@/thor/utils/httpErrors";

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const denied = requireAdmin(request);
  if (denied) {
    return denied;
  }

  try {
    const { documentId } = await context.params;
    const engine = getKnowledgeEngine();
    await engine.reindexDocument(documentId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: toApiError(error) }, { status: 503 });
  }
}
