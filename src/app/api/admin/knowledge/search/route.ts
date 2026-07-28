import { NextResponse } from "next/server";
import { getKnowledgeEngine } from "@/thor/brain/knowledgeEngine";
import { requireAdmin } from "@/thor/utils/adminAuth";
import { toApiError } from "@/thor/utils/httpErrors";

export async function GET(request: Request) {
  console.log("ADMIN_KNOWLEDGE_SEARCH_START", { time: new Date().toISOString() });

  const denied = requireAdmin(request);
  if (denied) {
    console.warn("ADMIN_KNOWLEDGE_SEARCH_DENIED", { time: new Date().toISOString() });
    return denied;
  }

  try {
    const url = new URL(request.url);
    const query = (url.searchParams.get("q") || "").trim();
    const limit = Number(url.searchParams.get("limit") || 6);

    if (!query) {
      return NextResponse.json({ query, total: 0, chunks: [] });
    }

    const engine = getKnowledgeEngine();
    const result = await engine.search({ query, limit: Number.isFinite(limit) ? limit : 6 });

    console.log("ADMIN_KNOWLEDGE_SEARCH_OK", {
      query,
      total: result.total,
      time: new Date().toISOString(),
    });

    return NextResponse.json(result);
  } catch (error) {
    const mapped = toApiError(error);
    console.error("ADMIN_KNOWLEDGE_SEARCH_ERROR", { error: mapped, time: new Date().toISOString() });
    return NextResponse.json({ error: mapped }, { status: 503 });
  }
}
