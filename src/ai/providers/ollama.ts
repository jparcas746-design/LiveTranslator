import type { AIProvider, AIProviderRequest } from "@/ai/providers/types";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1:8b";

type OllamaResponse = {
  message?: {
    content?: string;
  };
};

export const ollamaProvider: AIProvider = {
  name: "ollama",
  isConfigured: () => true,
  async generate(request: AIProviderRequest) {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: request.model || OLLAMA_MODEL,
        stream: false,
        messages: [
          {
            role: "system",
            content: request.systemPrompt,
          },
          ...request.messages,
        ],
        options: {
          temperature: request.temperature ?? 0,
          num_predict: request.maxTokens,
        },
      }),
    });

    const data = (await response.json().catch(() => null)) as OllamaResponse | null;

    if (!response.ok) {
      const error = Object.assign(
        new Error(`Ollama request failed with status ${response.status}`),
        {
          status: response.status,
          details: data,
        }
      );
      throw error;
    }

    const text = data?.message?.content?.trim() || "";
    if (!text) {
      throw Object.assign(new Error("Ollama returned an empty response"), { status: 502 });
    }

    return text;
  },
};
