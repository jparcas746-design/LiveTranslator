import Groq from "groq-sdk";
import type { AIProvider, AIProviderRequest } from "@/ai/providers/types";

const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const groqClient = process.env.GROQ_API_KEY
  ? new Groq({
      apiKey: process.env.GROQ_API_KEY,
    })
  : null;

export const groqProvider: AIProvider = {
  name: "groq",
  isConfigured: () => Boolean(groqClient),
  async generate(request: AIProviderRequest) {
    if (!groqClient) {
      throw Object.assign(new Error("GROQ_API_KEY missing in environment"), {
        status: 503,
      });
    }

    const completion = await groqClient.chat.completions.create({
      model: request.model || GROQ_MODEL,
      temperature: request.temperature ?? 0,
      max_tokens: request.maxTokens,
      messages: [
        {
          role: "system",
          content: request.systemPrompt,
        },
        ...request.messages,
      ],
    });

    const text = completion.choices?.[0]?.message?.content?.trim() || "";
    if (!text) {
      throw Object.assign(new Error("Groq returned an empty response"), { status: 502 });
    }

    return text;
  },
};
