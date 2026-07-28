export type ProviderName = "ollama" | "groq" | "gemini";

export type AIChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AIProviderRequest = {
  requestId: string;
  model?: string;
  systemPrompt: string;
  messages: AIChatMessage[];
  maxTokens: number;
  temperature?: number;
};

export type AIProvider = {
  name: ProviderName;
  isConfigured: () => boolean;
  generate: (request: AIProviderRequest) => Promise<string>;
};

export type ProviderErrorDetail = {
  provider: ProviderName;
  model: string;
  status?: number;
  message: string;
};

export function extractProviderStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const anyError = error as {
    status?: number;
    response?: { status?: number };
    cause?: { status?: number };
  };

  return anyError.status ?? anyError.response?.status ?? anyError.cause?.status;
}
