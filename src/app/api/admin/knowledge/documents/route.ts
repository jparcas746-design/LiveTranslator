import { NextResponse } from "next/server";
import { getKnowledgeEngine } from "@/thor/brain/knowledgeEngine";
import { requireAdmin } from "@/thor/utils/adminAuth";
import { toApiError } from "@/thor/utils/httpErrors";

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) {
    return denied;
  }

  try {
    const engine = getKnowledgeEngine();
    const documents = await engine.listDocuments();

    return NextResponse.json({
      documents,
    });
  } catch (error) {
    return NextResponse.json({ error: toApiError(error) }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) {
    return denied;
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    const category = String(form.get("category") || "general").trim() || "general";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Only PDF files are accepted" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const engine = getKnowledgeEngine();
    const result = await engine.ingest({
      fileName: file.name,
      sourceType: "pdf",
      category,
      fileBuffer: buffer,
      metadata: {
        uploadedAt: new Date().toISOString(),
        mimeType: file.type || "application/pdf",
      },
    });

    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: toApiError(error) }, { status: 503 });
  }
}
