import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

type SaveKnowledgeSourceInput = {
  fileName: string;
  fileBuffer: Buffer;
  category: string;
  sourceType: string;
  uploadedAt: string;
};

type SavedKnowledgeSource = {
  filePath: string;
  fileSizeBytes: number;
};

export type KnowledgeSourceStorage = {
  isConfigured: () => boolean;
  saveSource: (input: SaveKnowledgeSourceInput) => Promise<SavedKnowledgeSource>;
  readSource: (filePath: string) => Promise<Buffer>;
  deleteSource: (filePath: string) => Promise<void>;
};

export type StorageCapabilityError = {
  code: "KNOWLEDGE_STORAGE_NOT_CONFIGURED";
  message: string;
};

export function createStorageNotConfiguredError(): StorageCapabilityError {
  return {
    code: "KNOWLEDGE_STORAGE_NOT_CONFIGURED",
    message:
      "Knowledge source storage is not configured. Set THOR_KNOWLEDGE_STORAGE_DIR to a persistent volume path.",
  };
}

function sanitizeSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "") || "general";
}

function sanitizeFileName(fileName: string) {
  return fileName
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "document";
}

function resolveBaseDir() {
  const configured = process.env.THOR_KNOWLEDGE_STORAGE_DIR?.trim();
  if (!configured) {
    return null;
  }

  return path.resolve(configured);
}

function buildAbsolutePath(baseDir: string, relativePath: string) {
  const absolute = path.resolve(baseDir, relativePath);
  const relative = path.relative(baseDir, absolute);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Invalid storage path");
  }

  return absolute;
}

export const localPersistentKnowledgeStorage: KnowledgeSourceStorage = {
  isConfigured() {
    return Boolean(resolveBaseDir());
  },

  async saveSource(input) {
    const baseDir = resolveBaseDir();
    if (!baseDir) {
      throw createStorageNotConfiguredError();
    }

    const date = new Date(input.uploadedAt);
    const year = Number.isNaN(date.getTime()) ? "unknown" : String(date.getUTCFullYear());
    const month = Number.isNaN(date.getTime())
      ? "00"
      : String(date.getUTCMonth() + 1).padStart(2, "0");

    const category = sanitizeSegment(input.category || "general");
    const safeFileName = sanitizeFileName(input.fileName);
    const relativePath = path.posix.join(year, month, category, `${randomUUID()}-${safeFileName}`);

    const absolutePath = buildAbsolutePath(baseDir, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, input.fileBuffer);

    return {
      filePath: relativePath,
      fileSizeBytes: input.fileBuffer.byteLength,
    };
  },

  async readSource(filePathValue) {
    const baseDir = resolveBaseDir();
    if (!baseDir) {
      throw createStorageNotConfiguredError();
    }

    const absolutePath = buildAbsolutePath(baseDir, filePathValue);
    return fs.readFile(absolutePath);
  },

  async deleteSource(filePathValue) {
    const baseDir = resolveBaseDir();
    if (!baseDir) {
      throw createStorageNotConfiguredError();
    }

    const absolutePath = buildAbsolutePath(baseDir, filePathValue);
    try {
      await fs.unlink(absolutePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        throw error;
      }
    }
  },
};

export function resolveKnowledgeSourceStorage() {
  return localPersistentKnowledgeStorage;
}
