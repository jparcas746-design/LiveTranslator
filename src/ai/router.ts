import { detectIntent, isSimpleLocalIntent, type ThorIntent } from "@/ai/intents";
import { COMMAND_HELP_TEXT, getLocalResponse } from "@/ai/responses";
import { geminiProvider } from "@/ai/providers/gemini";
import { groqProvider } from "@/ai/providers/groq";
import { ollamaProvider } from "@/ai/providers/ollama";
import {
  extractProviderStatus,
  type AIChatMessage,
  type AIProvider,
  type ProviderErrorDetail,
} from "@/ai/providers/types";

export type ThorRequestPayload = {
  requestId: string;
  sessionId: string;
  messages?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  responseStyle?: "formal" | "balanced" | "casual";
  translationMode?: boolean;
  dictionaryMode?: boolean;
  webSearch?: boolean;
  sourceLanguage?: string;
  targetLanguage?: string;
  text?: string;
};

export type ThorCommandName =
  | "OPEN_SETTINGS"
  | "CHANGE_LANGUAGE"
  | "ENABLE_DARK_MODE"
  | "ENABLE_LIGHT_MODE"
  | "CLEAR_HISTORY"
  | "SHOW_HISTORY"
  | "COPY_LAST_RESULT"
  | "CLEAR_CONVERSATION";

export type ThorCommandResult = {
  name: ThorCommandName;
  executed: boolean;
  metadata?: Record<string, string | number | boolean>;
};

export type ThorRouterResult = {
  response: string;
  intent: ThorIntent;
  cached: boolean;
  usedProvider?: "ollama" | "groq" | "gemini";
  command?: ThorCommandResult;
  providers?: ProviderErrorDetail[];
};

type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
  at: number;
};

type SessionPreferences = {
  language: string;
  theme: "dark" | "light";
};

type ParsedCommand = {
  name: ThorCommandName;
  language?: string;
};

const providers: AIProvider[] = [ollamaProvider, groqProvider, geminiProvider];

const cache = new Map<string, { value: ThorRouterResult; expiresAt: number }>();
const conversationHistory = new Map<string, HistoryMessage[]>();
const sessionPreferences = new Map<string, SessionPreferences>();

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 250;
const HISTORY_LIMIT = 40;

function cleanCache() {
  const now = Date.now();
  for (const [key, item] of cache.entries()) {
    if (item.expiresAt <= now) {
      cache.delete(key);
    }
  }

  if (cache.size <= CACHE_MAX_ENTRIES) {
    return;
  }

  const sorted = Array.from(cache.entries()).sort(
    (left, right) => left[1].expiresAt - right[1].expiresAt
  );

  while (sorted.length > CACHE_MAX_ENTRIES) {
    const entry = sorted.shift();
    if (!entry) {
      break;
    }
    cache.delete(entry[0]);
  }
}

function getCachedResult(key: string): ThorRouterResult | null {
  cleanCache();
  const found = cache.get(key);
  if (!found || found.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return {
    ...found.value,
    cached: true,
  };
}

function setCachedResult(key: string, value: ThorRouterResult) {
  cleanCache();
  cache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function cleanMarkdownNoise(text: string) {
  return text
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/^[\s]*(translation|translated|traduccion|traduccion:\s*|translation:\s*)/i, "")
    .trim();
}

function getLatestUserMessage(payload: ThorRequestPayload) {
  if (typeof payload.text === "string" && payload.text.trim()) {
    return payload.text.trim();
  }

  const list = Array.isArray(payload.messages) ? payload.messages : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const current = list[index];
    if (current?.role === "user" && typeof current.content === "string" && current.content.trim()) {
      return current.content.trim();
    }
  }

  return "";
}

function appendHistory(sessionId: string, role: "user" | "assistant", content: string) {
  const current = conversationHistory.get(sessionId) || [];
  const next = [...current, { role, content, at: Date.now() }].slice(-HISTORY_LIMIT);
  conversationHistory.set(sessionId, next);
}

function getHistory(sessionId: string, limit = 12) {
  const all = conversationHistory.get(sessionId) || [];
  return all.slice(-limit);
}

function clearHistory(sessionId: string) {
  conversationHistory.delete(sessionId);
}

function getPreferences(sessionId: string): SessionPreferences {
  const existing = sessionPreferences.get(sessionId);
  if (existing) {
    return existing;
  }

  const defaults: SessionPreferences = {
    language: "es-ES",
    theme: "dark",
  };

  sessionPreferences.set(sessionId, defaults);
  return defaults;
}

function setPreferences(sessionId: string, patch: Partial<SessionPreferences>) {
  const current = getPreferences(sessionId);
  sessionPreferences.set(sessionId, {
    ...current,
    ...patch,
  });
}

function parseCommand(message: string): ParsedCommand | null {
  const text = message.trim().toLowerCase();

  if (/\b(abrir|open)\s+(ajustes|configuracion|configuraci[oó]n|settings)\b/i.test(text)) {
    return { name: "OPEN_SETTINGS" };
  }

  const languageMatch = text.match(
    /\b(cambiar|change)\s+(idioma|language)(\s+(a|to))?\s+([a-z]{2}(?:-[a-z]{2})?)\b/i
  );
  if (languageMatch) {
    return {
      name: "CHANGE_LANGUAGE",
      language: languageMatch[5],
    };
  }

  if (/\b(activar|enable|poner|set)\s+(modo\s+)?(oscuro|dark)\b/i.test(text)) {
    return { name: "ENABLE_DARK_MODE" };
  }

  if (/\b(activar|enable|poner|set)\s+(modo\s+)?(claro|light)\b/i.test(text)) {
    return { name: "ENABLE_LIGHT_MODE" };
  }

  if (/\b(borrar|eliminar|limpiar|clear)\s+(historial|history)\b/i.test(text)) {
    return { name: "CLEAR_HISTORY" };
  }

  if (/\b(mostrar|ver|show)\s+(historial|history)\b/i.test(text)) {
    return { name: "SHOW_HISTORY" };
  }

  if (/\b(copiar|copy)\s+(ultimo|ultima|last)\s+(resultado|response|reply)\b/i.test(text)) {
    return { name: "COPY_LAST_RESULT" };
  }

  if (/\b(limpiar|clear)\s+(conversacion|conversaci[oó]n|chat)\b/i.test(text)) {
    return { name: "CLEAR_CONVERSATION" };
  }

  return null;
}

function commandFallbackText(command: ThorCommandName) {
  switch (command) {
    case "OPEN_SETTINGS":
      return "Abre el panel de ajustes desde la barra lateral para continuar.";
    case "CHANGE_LANGUAGE":
      return "Idioma actualizado correctamente para esta sesion.";
    case "ENABLE_DARK_MODE":
      return "Modo oscuro activado para esta sesion.";
    case "ENABLE_LIGHT_MODE":
      return "Modo claro activado para esta sesion.";
    case "CLEAR_HISTORY":
      return "Historial borrado.";
    case "SHOW_HISTORY":
      return "No hay historial para mostrar.";
    case "COPY_LAST_RESULT":
      return "No encuentro un resultado previo para copiar.";
    case "CLEAR_CONVERSATION":
      return "Conversacion limpiada correctamente.";
    default:
      return "Comando ejecutado.";
  }
}

function executeCommand(sessionId: string, command: ParsedCommand): { response: string; command: ThorCommandResult } {
  if (command.name === "OPEN_SETTINGS") {
    return {
      response: commandFallbackText(command.name),
      command: {
        name: command.name,
        executed: true,
      },
    };
  }

  if (command.name === "CHANGE_LANGUAGE") {
    const nextLanguage = (command.language || "es-ES").toLowerCase();
    setPreferences(sessionId, { language: nextLanguage });

    return {
      response: `Idioma actualizado a ${nextLanguage}.`,
      command: {
        name: command.name,
        executed: true,
        metadata: { language: nextLanguage },
      },
    };
  }

  if (command.name === "ENABLE_DARK_MODE") {
    setPreferences(sessionId, { theme: "dark" });
    return {
      response: commandFallbackText(command.name),
      command: {
        name: command.name,
        executed: true,
        metadata: { theme: "dark" },
      },
    };
  }

  if (command.name === "ENABLE_LIGHT_MODE") {
    setPreferences(sessionId, { theme: "light" });
    return {
      response: commandFallbackText(command.name),
      command: {
        name: command.name,
        executed: true,
        metadata: { theme: "light" },
      },
    };
  }

  if (command.name === "CLEAR_HISTORY") {
    clearHistory(sessionId);
    return {
      response: commandFallbackText(command.name),
      command: {
        name: command.name,
        executed: true,
      },
    };
  }

  if (command.name === "SHOW_HISTORY") {
    const entries = getHistory(sessionId, 10);
    const list = entries
      .map((entry, index) => `${index + 1}. ${entry.role === "user" ? "Usuario" : "ThorAI"}: ${entry.content}`)
      .join("\n");

    return {
      response: list ? `Historial reciente:\n${list}` : commandFallbackText(command.name),
      command: {
        name: command.name,
        executed: true,
        metadata: {
          count: entries.length,
        },
      },
    };
  }

  if (command.name === "COPY_LAST_RESULT") {
    const entries = getHistory(sessionId, 8).filter((entry) => entry.role === "assistant");
    const last = entries[entries.length - 1];

    return {
      response: last
        ? `Ultimo resultado:\n${last.content}\n\nPuedes copiarlo desde la interfaz.`
        : commandFallbackText(command.name),
      command: {
        name: command.name,
        executed: Boolean(last),
      },
    };
  }

  clearHistory(sessionId);
  return {
    response: commandFallbackText("CLEAR_CONVERSATION"),
    command: {
      name: "CLEAR_CONVERSATION",
      executed: true,
    },
  };
}

function buildCacheKey(payload: ThorRequestPayload, intent: ThorIntent, userMessage: string) {
  return JSON.stringify({
    intent,
    text: userMessage,
    responseStyle: payload.responseStyle || "balanced",
    translationMode: Boolean(payload.translationMode),
    dictionaryMode: Boolean(payload.dictionaryMode),
    sourceLanguage: payload.sourceLanguage || "auto",
    targetLanguage: payload.targetLanguage || "en-US",
  });
}

function getStyleInstruction(style: ThorRequestPayload["responseStyle"]) {
  if (style === "formal") {
    return "Use a professional, structured and academic communication style.";
  }

  if (style === "casual") {
    return [
      "When responseStyle is casual, ThorAI should sound like a close friend explaining something interesting.",
      "Use natural and concise language.",
      "You can use light humor when relevant.",
      "Do not overuse slang.",
    ].join("\n");
  }

  return "Use a natural and friendly communication style.";
}

async function searchWeb(query: string) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return "";
  }

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "smart",
        max_results: 5,
      }),
    });

    if (!response.ok) {
      return "";
    }

    const payload = (await response.json().catch(() => null)) as
      | { results?: Array<{ title: string; content: string; url: string }> }
      | null;

    if (!payload?.results?.length) {
      return "";
    }

    return payload.results
      .map((item) => `Source: ${item.title}\nContent: ${item.content}\nURL: ${item.url}`)
      .join("\n\n");
  } catch {
    return "";
  }
}

function buildPrompt(payload: ThorRequestPayload, webContext: string, inputText: string) {
  const translationMode = Boolean(payload.translationMode);
  const dictionaryMode = Boolean(payload.dictionaryMode);

  if (translationMode) {
    return `You are in Translation Mode.

Your only task is to translate the user's exact words from the source language to the target language.

Rules:
- Return ONLY the translated text.
- Preserve intent and tone.
- Do not answer questions or add commentary.

Source language: ${payload.sourceLanguage || "auto"}
Target language: ${payload.targetLanguage || "en-US"}
Input: ${inputText}`;
  }

  if (dictionaryMode) {
    return `You are a bilingual educational dictionary assistant.

Describe a single word in clear dictionary style.
Use plain text labels in this order when relevant:
Main translation, Word type, Pronunciation, Definitions, Common translations, Example sentences, Common expressions, Synonyms, Antonyms, Verb forms.

Word to define: ${inputText}`;
  }

  const styleInstruction = getStyleInstruction(payload.responseStyle || "balanced");

  return `You are ThorAI, a multilingual virtual assistant.

IMPORTANT LANGUAGE RULE:
1. Detect the language of the user's current message.
2. Reply only in that same language.
3. Keep responses concise unless the user asks for depth.

Response style:
${styleInstruction}

${
  webContext
    ? `Web context (for synthesis only, never copy protected text):\n${webContext}\n`
    : ""
}
`;
}

function shouldUseAI(intent: ThorIntent, payload: ThorRequestPayload) {
  if (payload.translationMode || payload.dictionaryMode) {
    return true;
  }

  if (intent === "AI" || intent === "UNKNOWN" || intent === "TRANSLATE" || intent === "DICTIONARY" || intent === "GRAMMAR") {
    return true;
  }

  return false;
}

function convertIncomingMessages(payload: ThorRequestPayload): AIChatMessage[] {
  const incoming = Array.isArray(payload.messages) ? payload.messages : [];

  if (incoming.length > 0) {
    return incoming
      .filter(
        (message): message is AIChatMessage =>
          Boolean(message) &&
          (message.role === "user" || message.role === "assistant" || message.role === "system") &&
          typeof message.content === "string"
      )
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));
  }

  const fallbackHistory = getHistory(payload.sessionId, 12);
  return fallbackHistory.map((entry) => ({
    role: entry.role,
    content: entry.content,
  }));
}

async function askProviderWithFallback(payload: ThorRequestPayload, systemPrompt: string, messages: AIChatMessage[]) {
  const providerErrors: ProviderErrorDetail[] = [];

  for (const provider of providers) {
    if (!provider.isConfigured()) {
      providerErrors.push({
        provider: provider.name,
        model: "not-configured",
        status: 503,
        message: `${provider.name} provider is not configured`,
      });
      continue;
    }

    try {
      const response = await provider.generate({
        requestId: payload.requestId,
        systemPrompt,
        messages,
        maxTokens: payload.translationMode ? 400 : payload.dictionaryMode ? 1000 : 1400,
        temperature: 0,
      });

      return {
        provider: provider.name,
        response,
        errors: providerErrors,
      };
    } catch (error) {
      providerErrors.push({
        provider: provider.name,
        model: "default",
        status: extractProviderStatus(error),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const failure = new Error("No provider could generate a response");
  (failure as Error & { details?: ProviderErrorDetail[] }).details = providerErrors;
  throw failure;
}

export async function routeThorRequest(payload: ThorRequestPayload): Promise<ThorRouterResult> {
  const userMessage = getLatestUserMessage(payload);
  const intent = detectIntent({
    message: userMessage,
    translationMode: payload.translationMode,
    dictionaryMode: payload.dictionaryMode,
  });

  const cacheKey = buildCacheKey(payload, intent, userMessage);

  if (shouldUseAI(intent, payload)) {
    const cached = getCachedResult(cacheKey);
    if (cached) {
      return cached;
    }
  }

  if (intent === "COMMAND") {
    const parsed = parseCommand(userMessage);

    if (!parsed) {
      const response = `${getLocalResponse("HELP", {
        historyCount: getHistory(payload.sessionId).length,
        preferredLanguage: getPreferences(payload.sessionId).language,
      })}\n\n${COMMAND_HELP_TEXT}`;

      appendHistory(payload.sessionId, "user", userMessage);
      appendHistory(payload.sessionId, "assistant", response);

      return {
        response,
        intent,
        cached: false,
      };
    }

    appendHistory(payload.sessionId, "user", userMessage);
    const execution = executeCommand(payload.sessionId, parsed);
    appendHistory(payload.sessionId, "assistant", execution.response);

    return {
      response: execution.response,
      intent,
      cached: false,
      command: execution.command,
    };
  }

  if (isSimpleLocalIntent(intent) && !shouldUseAI(intent, payload)) {
    const response = getLocalResponse(intent, {
      historyCount: getHistory(payload.sessionId).length,
      preferredLanguage: getPreferences(payload.sessionId).language,
    });

    if (userMessage) {
      appendHistory(payload.sessionId, "user", userMessage);
    }
    appendHistory(payload.sessionId, "assistant", response);

    return {
      response,
      intent,
      cached: false,
    };
  }

  const messages = convertIncomingMessages(payload);

  const webContext =
    payload.webSearch && !payload.translationMode && !payload.dictionaryMode && userMessage
      ? await searchWeb(userMessage)
      : "";

  const systemPrompt = buildPrompt(payload, webContext, userMessage);

  const aiResult = await askProviderWithFallback(payload, systemPrompt, messages);
  const cleaned = cleanMarkdownNoise(aiResult.response);

  if (userMessage) {
    appendHistory(payload.sessionId, "user", userMessage);
  }
  appendHistory(payload.sessionId, "assistant", cleaned);

  const result: ThorRouterResult = {
    response: cleaned,
    intent,
    cached: false,
    usedProvider: aiResult.provider,
    providers: aiResult.errors,
  };

  setCachedResult(cacheKey, result);

  return result;
}

export function getSessionHistoryCount(sessionId: string) {
  return getHistory(sessionId, HISTORY_LIMIT).length;
}
