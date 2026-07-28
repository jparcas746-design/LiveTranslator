import { NextResponse } from "next/server";
import { getKnowledgeEngine } from "@/thor/brain/knowledgeEngine";
import { requireAdmin } from "@/thor/utils/adminAuth";
import { toApiError } from "@/thor/utils/httpErrors";

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  console.log("ADMIN_KNOWLEDGE_REINDEX_START", { time: new Date().toISOString() });
  const denied = requireAdmin(request);
  if (denied) {
    console.warn("ADMIN_KNOWLEDGE_REINDEX_DENIED", { time: new Date().toISOString() });
    return denied;
  }

  try {
    const { documentId } = await context.params;
    const engine = getKnowledgeEngine();
    await engine.reindexDocument(documentId);

    console.log("ADMIN_KNOWLEDGE_REINDEX_OK", { documentId, time: new Date().toISOString() });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("ADMIN_KNOWLEDGE_REINDEX_ERROR", {
      error: toApiError(error),
      time: new Date().toISOString(),
    });
    return NextResponse.json({ error: toApiError(error) }, { status: 503 });
  }
}
