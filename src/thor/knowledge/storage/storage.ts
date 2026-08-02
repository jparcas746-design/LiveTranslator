import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { del, put } from "@vercel/blob";

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
      "Knowledge source storage is not configured. Set DATABASE_URL to a valid PostgreSQL connection string.",
  };
}

let sourcePool: Pool | null = null;
let sourceSchemaReadyPromise: Promise<void> | null = null;

function resolveConnectionString() {
  return process.env.DATABASE_URL?.trim() || null;
}

function getSourcePool() {
  if (sourcePool) {
    return sourcePool;
  }

  const connectionString = resolveConnectionString();

  if (!connectionString) {
    return null;
  }

  sourcePool = new Pool({ connectionString });
  return sourcePool;
}

async function ensureSourceSchema(connection: Pool) {
  if (!sourceSchemaReadyPromise) {
    sourceSchemaReadyPromise = connection
      .query(
        `
        CREATE TABLE IF NOT EXISTS thor_knowledge_sources (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          storage_key TEXT NOT NULL UNIQUE,
          file_name TEXT NOT NULL,
          source_type TEXT NOT NULL,
          category TEXT NOT NULL,
          file_bytes BYTEA NOT NULL,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_thor_knowledge_sources_storage_key
          ON thor_knowledge_sources(storage_key);
        `
      )
      .then(() => undefined)
      .catch((error) => {
        sourceSchemaReadyPromise = null;
        throw error;
      });
  }

  await sourceSchemaReadyPromise;
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
  if (configured) {
    return path.resolve(configured);
  }

  // Local fallback is persistent across reloads/restarts in non-serverless environments.
  if (process.env.VERCEL === "1") {
    return null;
  }

  return path.resolve(process.cwd(), ".thor-knowledge-storage");
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

export const postgresKnowledgeSourceStorage: KnowledgeSourceStorage = {
  isConfigured() {
    return Boolean(getSourcePool());
  },

  async saveSource(input) {
    const connection = getSourcePool();
    if (!connection) {
      throw createStorageNotConfiguredError();
    }

    await ensureSourceSchema(connection);

    const category = sanitizeSegment(input.category || "general");
    const safeFileName = sanitizeFileName(input.fileName);
    const storageKey = `pg/${category}/${randomUUID()}-${safeFileName}`;

    await connection.query(
      `
      INSERT INTO thor_knowledge_sources
        (storage_key, file_name, source_type, category, file_bytes, metadata)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [
        storageKey,
        input.fileName,
        input.sourceType,
        input.category || "general",
        input.fileBuffer,
        JSON.stringify({ uploadedAt: input.uploadedAt }),
      ]
    );

    return {
      filePath: `pg:${storageKey}`,
      fileSizeBytes: input.fileBuffer.byteLength,
    };
  },

  async readSource(filePathValue) {
    const connection = getSourcePool();
    if (!connection) {
      throw createStorageNotConfiguredError();
    }

    await ensureSourceSchema(connection);

    const storageKey = filePathValue.startsWith("pg:") ? filePathValue.slice(3) : filePathValue;
    const result = await connection.query<{ file_bytes: Buffer }>(
      `SELECT file_bytes FROM thor_knowledge_sources WHERE storage_key = $1 LIMIT 1`,
      [storageKey]
    );

    if (!result.rows[0]) {
      throw new Error("Document source file not found in PostgreSQL storage");
    }

    return result.rows[0].file_bytes;
  },

  async deleteSource(filePathValue) {
    const connection = getSourcePool();
    if (!connection) {
      throw createStorageNotConfiguredError();
    }

    await ensureSourceSchema(connection);

    const storageKey = filePathValue.startsWith("pg:") ? filePathValue.slice(3) : filePathValue;
    await connection.query(`DELETE FROM thor_knowledge_sources WHERE storage_key = $1`, [storageKey]);
  },
};

export const vercelBlobKnowledgeStorage: KnowledgeSourceStorage = {
  isConfigured() {
    return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
  },

  async saveSource(input) {
    if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
      throw createStorageNotConfiguredError();
    }

    const safeFileName = sanitizeFileName(input.fileName);
    const category = sanitizeSegment(input.category || "general");
    const key = `thor-knowledge/${category}/${randomUUID()}-${safeFileName}`;

    const uploaded = await put(key, input.fileBuffer, {
      access: "public",
      contentType: "application/octet-stream",
      addRandomSuffix: false,
    });

    return {
      filePath: `blob:${uploaded.url}`,
      fileSizeBytes: input.fileBuffer.byteLength,
    };
  },

  async readSource(filePathValue) {
    const blobUrl = filePathValue.startsWith("blob:") ? filePathValue.slice(5) : filePathValue;
    const response = await fetch(blobUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Unable to read source blob (${response.status})`);
    }

    const payload = await response.arrayBuffer();
    return Buffer.from(payload);
  },

  async deleteSource(filePathValue) {
    const blobUrl = filePathValue.startsWith("blob:") ? filePathValue.slice(5) : filePathValue;
    await del(blobUrl);
  },
};

export function resolveKnowledgeSourceStorage() {
  if (postgresKnowledgeSourceStorage.isConfigured()) {
    return postgresKnowledgeSourceStorage;
  }

  if (vercelBlobKnowledgeStorage.isConfigured()) {
    return vercelBlobKnowledgeStorage;
  }

  return localPersistentKnowledgeStorage;
}
