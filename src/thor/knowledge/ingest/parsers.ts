import mammoth from "mammoth";
import { createRequire } from "module";
import type { ExtractedDocument, SourceType } from "@/thor/knowledge/types";

const require = createRequire(import.meta.url);

export type DocumentParser = {
  sourceType: SourceType;
  parse: (fileBuffer: Buffer) => Promise<ExtractedDocument>;
};

const pdfParser: DocumentParser = {
  sourceType: "pdf",
  async parse(fileBuffer: Buffer) {
    try {
      const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
        dataBuffer: Buffer
      ) => Promise<{ text?: string }>;
      const parsed = await pdfParse(fileBuffer);
      const text = String(parsed?.text || "").trim();

      if (text.length > 0) {
        return {
          text,
          pageTexts: [],
        };
      }
    } catch (error) {
      console.warn("PDF_PARSE_PRIMARY_FAILED", {
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    const binaryText = fileBuffer
      .toString("latin1")
      .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const fallbackText =
      binaryText.length > 80
        ? binaryText
        : "PDF uploaded. Structured text extraction is unavailable for this document, but the file was indexed.";

    return {
      text: fallbackText,
      pageTexts: [],
    };
  },
};

const parserRegistry = new Map<SourceType, DocumentParser>([["pdf", pdfParser]]);

const txtParser: DocumentParser = {
  sourceType: "text",
  async parse(fileBuffer: Buffer) {
    return {
      text: fileBuffer.toString("utf-8"),
      pageTexts: [],
    };
  },
};

const wordParser: DocumentParser = {
  sourceType: "word",
  async parse(fileBuffer: Buffer) {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return {
      text: result.value || "",
      pageTexts: [],
    };
  },
};

parserRegistry.set("text", txtParser);
parserRegistry.set("word", wordParser);

export function resolveParser(sourceType: SourceType) {
  const parser = parserRegistry.get(sourceType);
  if (!parser) {
    throw new Error(`No parser registered for source type: ${sourceType}`);
  }

  return parser;
}

export function registerParser(parser: DocumentParser) {
  parserRegistry.set(parser.sourceType, parser);
}
