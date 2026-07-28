import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import type { ExtractedDocument, SourceType } from "@/thor/knowledge/types";

export type DocumentParser = {
  sourceType: SourceType;
  parse: (fileBuffer: Buffer) => Promise<ExtractedDocument>;
};

const pdfParser: DocumentParser = {
  sourceType: "pdf",
  async parse(fileBuffer: Buffer) {
    const parser = new PDFParse({ data: fileBuffer });
    const parsed = await parser.getText();
    await parser.destroy();

    return {
      text: parsed.text || "",
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
