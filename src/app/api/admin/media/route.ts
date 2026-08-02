import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/thor/utils/adminAuth";

export const runtime = "nodejs";

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) {
    return denied;
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image files are accepted" }, { status: 400 });
  }

  const publicDir = path.resolve(process.cwd(), "public", "signipedia-media");
  await fs.mkdir(publicDir, { recursive: true });

  const bytes = await file.arrayBuffer();
  const extension = path.extname(file.name) || ".png";
  const fileName = `${Date.now()}-${sanitizeFileName(path.basename(file.name, extension))}${extension}`;
  const filePath = path.join(publicDir, fileName);
  await fs.writeFile(filePath, Buffer.from(bytes));

  return NextResponse.json({
    fileName,
    url: `/signipedia-media/${fileName}`,
  });
}
