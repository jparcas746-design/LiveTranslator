import { NextResponse } from "next/server";
import { requireAdmin } from "@/thor/utils/adminAuth";
import { getSignipediaEngine } from "@/thor/signipedia/engine";
import { uploadSymbolImageToCloudinary } from "@/thor/signipedia/media/cloudinary";
import { thorLogger } from "@/thor/utils/logger";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function getRequestId(request: Request) {
  return request.headers.get("x-request-id") ||
    request.headers.get("x-vercel-id") ||
    `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    const denied = requireAdmin(request);
    if (denied) {
      return denied;
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const symbolId = String(formData.get("symbolId") || "").trim() || null;
    if (!symbolId) {
      return NextResponse.json(
        {
          error: "symbolId is required. Select a symbol before uploading an image.",
          requestId,
        },
        { status: 400 }
      );
    }


    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required", requestId }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Formato no soportado. Usa JPG, PNG, WEBP, AVIF o GIF.", requestId },
        { status: 400 }
      );
    }

    if (file.size <= 0) {
      return NextResponse.json({ error: "El archivo está vacío.", requestId }, { status: 400 });
    }

    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: `La imagen supera el límite de ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))}MB.`, requestId },
        { status: 413 }
      );
    }

    const bytes = await file.arrayBuffer();
    const fileName = sanitizeFileName(file.name.replace(/\.[a-z0-9]+$/i, "")) || `symbol-${Date.now()}`;
    const uploaded = await uploadSymbolImageToCloudinary(Buffer.from(bytes), { fileName });

    thorLogger.info("admin.media.upload", "Cloudinary secure_url received", {
      requestId,
      symbolId,
      secureUrl: uploaded.secureUrl,
      publicId: uploaded.publicId,
      bytes: uploaded.bytes,
      format: uploaded.format,
    });

    let persistedUrl: string | null = null;
    let readbackUrl: string | null = null;

    const engine = getSignipediaEngine();
    const detail = await engine.getSymbolDetailById(symbolId);
    if (!detail) {
      return NextResponse.json(
        {
          error: "No se encontró el símbolo para asociar la imagen.",
          requestId,
          secureUrl: uploaded.secureUrl,
        },
        { status: 404 }
      );
    }

    const currentMedia = detail.media
      .filter((item) => item.kind !== "image")
      .map((item) => ({
        kind: item.kind,
        url: item.url,
        altText: item.altText,
        credit: item.credit,
        width: item.width,
        height: item.height,
        sortOrder: item.sortOrder,
      }));

    const existingImages = detail.media
      .filter((item) => item.kind === "image")
      .map((item) => ({
        kind: item.kind,
        url: item.url,
        altText: item.altText,
        credit: item.credit,
        width: item.width,
        height: item.height,
        sortOrder: Math.max(item.sortOrder + 1, 1),
      }));

    const nextMedia = [
      {
        kind: "image" as const,
        url: uploaded.secureUrl,
        altText: detail.symbol.name,
        credit: null,
        width: uploaded.width,
        height: uploaded.height,
        sortOrder: 0,
      },
      ...existingImages,
      ...currentMedia,
    ];

    const savedMedia = await engine.setMedia(symbolId, nextMedia);
    persistedUrl =
      savedMedia.find((item) => item.kind === "image" && item.url === uploaded.secureUrl)?.url ||
      savedMedia.find((item) => item.kind === "image")?.url ||
      null;

    thorLogger.info("admin.media.upload", "URL saved to database", {
      requestId,
      symbolId,
      persistedUrl,
      mediaCount: savedMedia.length,
    });

    const readback = await engine.getSymbolDetailById(symbolId);
    readbackUrl =
      readback?.symbol.imageUrl ||
      readback?.media.find((item) => item.kind === "image")?.url ||
      null;

    thorLogger.info("admin.media.upload", "URL returned by symbol query", {
      requestId,
      symbolId,
      readbackUrl,
    });

    return NextResponse.json({
      ok: true,
      requestId,
      fileName: uploaded.publicId,
      url: uploaded.secureUrl,
      secureUrl: uploaded.secureUrl,
      publicId: uploaded.publicId,
      width: uploaded.width,
      height: uploaded.height,
      bytes: uploaded.bytes,
      format: uploaded.format,
      persistedUrl,
      readbackUrl,
    });
  } catch (error) {
    thorLogger.error("admin.media.upload", "Upload flow failed", {
      requestId,
      message: toErrorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        error: "No se pudo completar la subida de imagen.",
        requestId,
        details: toErrorMessage(error),
      },
      { status: 500 }
    );
  }
}
