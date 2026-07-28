import { GoogleGenAI } from "@google/genai";
import type { AIProvider, AIProviderRequest } from "@/ai/providers/types";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export const geminiProvider: AIProvider = {
  name: "gemini",
  isConfigured: () => Boolean(process.env.GEMINI_API_KEY),
  async generate(request: AIProviderRequest) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw Object.assign(new Error("GEMINI_API_KEY missing in environment"), {
        status: 503,
      });
    }

    const client = new GoogleGenAI({ apiKey });

    const completion = await client.models.generateContent({
      model: request.model || GEMINI_MODEL,
      config: {
        systemInstruction: request.systemPrompt,
        temperature: request.temperature ?? 0,
        maxOutputTokens: request.maxTokens,
      },
      contents: request.messages.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
    });

    const text = completion.text?.trim() || "";
    if (!text) {
      throw Object.assign(new Error("Gemini returned an empty response"), { status: 502 });
    }

    return text;
  },
};
