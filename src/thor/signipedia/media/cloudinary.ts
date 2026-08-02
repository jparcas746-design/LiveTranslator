import { v2 as cloudinary, type UploadApiOptions } from "cloudinary";

const CLOUDINARY_FOLDER = "signipedia/symbols";

let configured = false;

function ensureCloudinaryConfigured() {
  if (configured) {
    return;
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary is not configured. Required env vars: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET."
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  configured = true;
}

export type CloudinaryUploadResult = {
  secureUrl: string;
  publicId: string;
  width: number | null;
  height: number | null;
  bytes: number;
  format: string | null;
};

export async function uploadSymbolImageToCloudinary(
  buffer: Buffer,
  options?: { fileName?: string; folder?: string }
) {
  ensureCloudinaryConfigured();

  const folder = options?.folder || CLOUDINARY_FOLDER;
  const uploadOptions: UploadApiOptions = {
    resource_type: "image",
    folder,
    use_filename: true,
    unique_filename: true,
    overwrite: false,
    filename_override: options?.fileName,
  };

  const result = await new Promise<any>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, uploadResult) => {
      if (error || !uploadResult) {
        reject(error || new Error("Cloudinary upload failed"));
        return;
      }
      resolve(uploadResult);
    });

    stream.end(buffer);
  });

  return {
    secureUrl: result.secure_url as string,
    publicId: result.public_id as string,
    width: Number.isFinite(result.width) ? Number(result.width) : null,
    height: Number.isFinite(result.height) ? Number(result.height) : null,
    bytes: Number(result.bytes || 0),
    format: typeof result.format === "string" ? result.format : null,
  } satisfies CloudinaryUploadResult;
}
