import { NextResponse } from "next/server";
import { getKnowledgeEngine } from "@/thor/brain/knowledgeEngine";
import { requireAdmin } from "@/thor/utils/adminAuth";
import { toApiError } from "@/thor/utils/httpErrors";
import type { SourceType } from "@/thor/knowledge/types";

export const runtime = "nodejs";

function resolveSourceType(fileName: string): SourceType | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".txt")) return "text";
  if (lower.endsWith(".doc") || lower.endsWith(".docx")) return "word";
  return null;
}

export async function GET(request: Request) {
  console.log("ADMIN_KNOWLEDGE_GET_START", {
    time: new Date().toISOString(),
    method: request.method,
    path: new URL(request.url).pathname,
    accept: request.headers.get("accept") || "",
  });
  const denied = requireAdmin(request);
  if (denied) {
    console.warn("ADMIN_KNOWLEDGE_GET_DENIED", { time: new Date().toISOString() });
    return denied;
  }

  try {
    const engine = getKnowledgeEngine();
    const documents = await engine.listDocuments();

    console.log("ADMIN_KNOWLEDGE_GET_OK", {
      total: documents.length,
      time: new Date().toISOString(),
    });

    return NextResponse.json({
      documents,
    });
  } catch (error) {
    console.error("ADMIN_KNOWLEDGE_GET_ERROR", {
      error: toApiError(error),
      time: new Date().toISOString(),
    });
    return NextResponse.json({ error: toApiError(error) }, { status: 503 });
  }
}

export async function POST(request: Request) {
  console.log("ADMIN_KNOWLEDGE_POST_START", {
    time: new Date().toISOString(),
    method: request.method,
    path: new URL(request.url).pathname,
    contentType: request.headers.get("content-type") || "",
    contentLength: request.headers.get("content-length") || "",
    userAgent: request.headers.get("user-agent") || "",
  });
  const denied = requireAdmin(request);
  if (denied) {
    console.warn("ADMIN_KNOWLEDGE_POST_DENIED", { time: new Date().toISOString() });
    return denied;
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    const category = String(form.get("category") || "general").trim() || "general";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const sourceType = resolveSourceType(file.name);
    if (!sourceType) {
      console.warn("ADMIN_KNOWLEDGE_POST_REJECTED_FILE_TYPE", {
        name: file.name,
        category,
        mimeType: file.type || "",
      });
      return NextResponse.json(
        { error: "Only PDF, TXT and Word (.doc/.docx) files are accepted" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const engine = getKnowledgeEngine();
    const result = await engine.ingest({
      fileName: file.name,
      sourceType,
      category,
      fileBuffer: buffer,
      metadata: {
        uploadedAt: new Date().toISOString(),
        mimeType: file.type || "application/pdf",
      },
    });

    console.log("ADMIN_KNOWLEDGE_POST_OK", {
      name: file.name,
      size: file.size,
      mimeType: file.type || "",
      sourceType,
      chunkCount: result.chunkCount,
      time: new Date().toISOString(),
    });

    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    const mapped = toApiError(error);
    console.error("ADMIN_KNOWLEDGE_POST_ERROR", {
      error: mapped,
      stack: error instanceof Error ? error.stack : undefined,
      time: new Date().toISOString(),
    });
    return NextResponse.json({ error: mapped }, { status: 503 });
  }
}
