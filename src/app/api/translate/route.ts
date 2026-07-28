import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const PROVIDER_CONCURRENCY_LIMIT = 2;
const RETRY_DELAYS_MS = [1000, 2000, 4000];
const RESPONSE_CACHE_TTL_MS = 60_000;
const RESPONSE_CACHE_MAX_ENTRIES = 200;

let activeProviderCalls = 0;
const providerQueue: Array<() => void> = [];
const responseCache = new Map<string, { value: string; expiresAt: number }>();

type ProviderName = "groq" | "gemini" | "openai";

type ProviderCallDetails = {
  requestId: string;
  provider: ProviderName;
  model: string;
  stage: string;
};

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractStatusCode(error: any): number | undefined {
  return (
    error?.status ??
    error?.response?.status ??
    error?.body?.error?.code ??
    error?.error?.code
  );
}

function isRateLimitError(error: any) {
  return extractStatusCode(error) === 429;
}

async function withProviderSlot<T>(fn: () => Promise<T>) {
  await new Promise<void>((resolve) => {
    if (activeProviderCalls < PROVIDER_CONCURRENCY_LIMIT) {
      activeProviderCalls += 1;
      resolve();
      return;
    }

    providerQueue.push(() => {
      activeProviderCalls += 1;
      resolve();
    });
  });

  try {
    return await fn();
  } finally {
    activeProviderCalls = Math.max(0, activeProviderCalls - 1);
    const next = providerQueue.shift();
    if (next) next();
  }
}

function formatError(error: any) {
  if (!error) {
    return { message: "Unknown error" };
  }

  const formatted: any = {
    message: error.message ?? String(error),
    name: error.name,
    stack: error.stack,
  };

  if (typeof error.status !== "undefined") {
    formatted.status = error.status;
  }
  if (typeof error.code !== "undefined") {
    formatted.code = error.code;
  }
  if (error.response) {
    formatted.response = {
      status: error.response.status,
      statusText: error.response.statusText,
      body: error.response.body ?? error.response.data ?? error.response,
    };
  }
  if (error.body) {
    formatted.body = error.body;
  }
  if (error.error) {
    formatted.error = error.error;
  }
  if (error.details) {
    formatted.details = error.details;
  }

  if (isRateLimitError(error)) {
    formatted.rateLimit = {
      reason:
        error?.body?.error?.message ??
        error?.error?.message ??
        error?.message ??
        "Too Many Requests",
      retryAfter:
        error?.headers?.["retry-after"] ??
        error?.response?.headers?.["retry-after"] ??
        null,
    };
  }

  return formatted;
}

async function runProviderCallWithRetry<T>(
  details: ProviderCallDetails,
  action: () => Promise<T>
): Promise<{ result: T; httpStatus: number }> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    const startedAt = Date.now();
    console.log("EXTERNAL CALL START", {
      requestId: details.requestId,
      provider: details.provider,
      model: details.model,
      stage: details.stage,
      attempt: attempt + 1,
      time: nowIso(),
    });

    try {
      const result = await withProviderSlot(action);
      const durationMs = Date.now() - startedAt;

      console.log("EXTERNAL CALL END", {
        requestId: details.requestId,
        provider: details.provider,
        model: details.model,
        stage: details.stage,
        attempt: attempt + 1,
        time: nowIso(),
        durationMs,
        httpStatus: 200,
      });

      return { result, httpStatus: 200 };
    } catch (error: any) {
      const durationMs = Date.now() - startedAt;
      const status = extractStatusCode(error) ?? 500;
      const formatted = formatError(error);

      console.error("EXTERNAL CALL ERROR", {
        requestId: details.requestId,
        provider: details.provider,
        model: details.model,
        stage: details.stage,
        attempt: attempt + 1,
        time: nowIso(),
        durationMs,
        httpStatus: status,
        error: formatted,
      });

      if (status === 429) {
        console.error("RATE LIMIT DETECTED", {
          requestId: details.requestId,
          provider: details.provider,
          model: details.model,
          reason: formatted.rateLimit?.reason ?? formatted.message,
          retryAfter: formatted.rateLimit?.retryAfter ?? null,
        });
      }

      const canRetry = status === 429 && attempt < RETRY_DELAYS_MS.length;
      if (!canRetry) {
        throw error;
      }

      const delayMs = RETRY_DELAYS_MS[attempt];
      console.log("EXTERNAL CALL RETRY", {
        requestId: details.requestId,
        provider: details.provider,
        model: details.model,
        stage: details.stage,
        nextAttempt: attempt + 2,
        delayMs,
      });
      await sleep(delayMs);
    }
  }

  throw new Error("Unreachable retry state");
}

function cleanupResponseCache() {
  const now = Date.now();
  for (const [key, entry] of responseCache.entries()) {
    if (entry.expiresAt <= now) {
      responseCache.delete(key);
    }
  }

  if (responseCache.size <= RESPONSE_CACHE_MAX_ENTRIES) {
    return;
  }

  const entries = Array.from(responseCache.entries()).sort(
    (a, b) => a[1].expiresAt - b[1].expiresAt
  );

  while (entries.length > RESPONSE_CACHE_MAX_ENTRIES) {
    const oldest = entries.shift();
    if (!oldest) break;
    responseCache.delete(oldest[0]);
  }
}

function getCachedResponse(cacheKey: string) {
  cleanupResponseCache();
  const cached = responseCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    responseCache.delete(cacheKey);
    return null;
  }

  return cached.value;
}

function setCachedResponse(cacheKey: string, value: string) {
  cleanupResponseCache();
  responseCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS,
  });
}

function buildCacheKey(payload: {
  responseStyle: string;
  translationMode: boolean;
  dictionaryMode: boolean;
  webSearch: boolean;
  sourceLanguage: string;
  targetLanguage: string;
  text: unknown;
  messages: any[];
}) {
  const normalized = {
    responseStyle: payload.responseStyle,
    translationMode: payload.translationMode,
    dictionaryMode: payload.dictionaryMode,
    webSearch: payload.webSearch,
    sourceLanguage: payload.sourceLanguage,
    targetLanguage: payload.targetLanguage,
    text: typeof payload.text === "string" ? payload.text : "",
    messages: payload.messages,
  };
  return JSON.stringify(normalized);
}

/**
 * Helper function to search the web using Tavily API
 */
async function searchWeb(requestId: string, query: string) {
  const startedAt = Date.now();
  const provider = "tavily";
  const model = "search";

  console.log("EXTERNAL CALL START", {
    requestId,
    provider,
    model,
    stage: "web-search",
    time: nowIso(),
    query,
  });

  if (!process.env.TAVILY_API_KEY) {
    console.warn("TAVILY: missing API key, returning empty search context", {
      requestId,
    });
    return "";
  }

  try {
    const response = await withProviderSlot(() =>
      fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query,
          search_depth: "smart",
          max_results: 5,
        }),
      })
    );

    const durationMs = Date.now() - startedAt;
    const text = await response.text();
    let data: any = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch (parseError) {
      console.warn("TAVILY: could not parse JSON response", {
        requestId,
        parseError: formatError(parseError),
        body: text,
      });
    }

    console.log("EXTERNAL CALL END", {
      requestId,
      provider,
      model,
      stage: "web-search",
      time: nowIso(),
      durationMs,
      httpStatus: response.status,
    });

    if (!response.ok) {
      console.error("TAVILY: non-ok response", {
        requestId,
        status: response.status,
        statusText: response.statusText,
        body: data ?? text,
      });
      return "";
    }

    if (!data?.results) {
      return "";
    }

    return data.results
      .map((r: any) => `Source: ${r.title}\nContent: ${r.content}\nURL: ${r.url}`)
      .join("\n\n");
  } catch (error) {
    console.error("TAVILY ERROR", {
      requestId,
      error: formatError(error),
    });
    return "";
  }
}

async function askGroq(
  requestId: string,
  model: string,
  systemPrompt: string,
  messages: ChatMessage[],
  maxTokens: number,
  stage: string
) {
  const { result } = await runProviderCallWithRetry(
    {
      requestId,
      provider: "groq",
      model,
      stage,
    },
    async () =>
      groq.chat.completions.create({
        model,
        temperature: 0,
        max_tokens: maxTokens,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          ...messages,
        ],
      })
  );

  return result.choices?.[0]?.message?.content ?? "";
}

async function askGemini(
  requestId: string,
  systemPrompt: string,
  messages: ChatMessage[],
  maxTokens: number,
  stage: string
) {
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!geminiApiKey) {
    const missingKeyError = Object.assign(
      new Error("GEMINI_API_KEY missing in environment"),
      { status: 503 }
    );
    throw missingKeyError;
  }

  const client = new GoogleGenAI({
    apiKey: geminiApiKey,
  });

  const formattedContents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const { result } = await runProviderCallWithRetry(
    {
      requestId,
      provider: "gemini",
      model: "gemini-3.5-flash",
      stage,
    },
    async () =>
      client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: formattedContents,
        config: {
          systemInstruction: systemPrompt,
          maxOutputTokens: maxTokens,
          temperature: 0,
        },
      })
  );

  return result.text ?? "";
}

async function askOpenAI(
  requestId: string,
  systemPrompt: string,
  messages: ChatMessage[],
  maxTokens: number,
  stage: string
) {
  if (!openai) {
    throw Object.assign(new Error("OPENAI_API_KEY missing in environment"), {
      status: 503,
    });
  }

  const { result } = await runProviderCallWithRetry(
    {
      requestId,
      provider: "openai",
      model: "gpt-4.1-mini",
      stage,
    },
    async () =>
      openai.chat.completions.create({
        model: "gpt-4.1-mini",
        temperature: 0,
        max_tokens: maxTokens,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          ...messages,
        ],
      })
  );

  return result.choices?.[0]?.message?.content ?? "";
}

export async function POST(req: Request) {
  const requestId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  console.log("TRANSLATE REQUEST START", { requestId, time: nowIso() });

  try {
    const {
      messages = [],
      responseStyle = "balanced",
      translationMode = false,
      dictionaryMode = false,
      webSearch = false,
      sourceLanguage = "auto",
      targetLanguage = "en",
      text,
    } = await req.json();

    const conversationMessages = Array.isArray(messages) ? messages : [];

    console.log("TRANSLATE: request parsed", {
      requestId,
      responseStyle,
      translationMode,
      dictionaryMode,
      webSearch,
      sourceLanguage,
      targetLanguage,
      incomingMessages: conversationMessages.length,
      textLength: typeof text === "string" ? text.length : 0,
      time: nowIso(),
    });

    const cacheKey = buildCacheKey({
      responseStyle,
      translationMode,
      dictionaryMode,
      webSearch,
      sourceLanguage,
      targetLanguage,
      text,
      messages: conversationMessages,
    });

    const cachedResponse = getCachedResponse(cacheKey);
    if (cachedResponse !== null) {
      console.log("CACHE HIT", { requestId, time: nowIso() });
      return NextResponse.json({ response: cachedResponse, cached: true });
    }

    console.log("CACHE MISS", { requestId, time: nowIso() });

    const styleInstruction =
      responseStyle === "formal"
        ? "Use a professional, structured and academic communication style."
        : responseStyle === "casual"
          ? "When responseStyle is casual, ThorAI should sound like a close friend explaining something interesting.\n\nImagine you are explaining the topic to a friend sitting next to you, not writing an article.\n\nStyle rules:\n- Start naturally when appropriate with expressions like:\n  'Mira,'\n  'Basically,'\n  'La cosa es que...'\n  'En pocas palabras...'\n  'Te cuento...'\n\n- Avoid starting every answer like:\n  'X was a...'\n  'According to history...'\n  'The following is...'\n\n- Prefer storytelling and explanations over encyclopedia summaries.\n\n- React naturally to interesting facts:\n  'Lo curioso es que...'\n  'Aqui viene la parte interesante...'\n  'Lo mas loco de esto es...'\n\n- Use light humor occasionally when it fits.\n\n- Use casual language, but remain intelligent and accurate.\n\n- Do not overuse slang."
          : "Use a natural and friendly communication style.";

    const translationPrompt = `You are in Translation Mode.

Your only task is to translate the user's exact words from the source language to the target language.

Treat every user message as text to translate, never as a request to answer, solve, explain, summarize, or analyze.

NEVER:
- Answer questions.
- Solve mathematical problems.
- Explain concepts.
- Give additional information.
- Change the meaning.
- Add commentary such as "Translation:", "The answer is", or any explanation.

Rules:
- Return ONLY the translated text.
- Preserve the original meaning and natural phrasing.
- Keep the same intent, tone, and sentence structure as much as possible.
- If the input is a question, command, math sentence, or historical statement, translate it as text only.

Source language: ${sourceLanguage === "auto" ? "auto-detected" : sourceLanguage}
Target language: ${targetLanguage}`;

    const translationInput =
      typeof text === "string" && text.trim()
        ? text
        : conversationMessages.length > 0
          ? conversationMessages[conversationMessages.length - 1]?.content ?? ""
          : "";

    const dictionaryPrompt = `You are a bilingual educational dictionary assistant for Spanish-English and English-Spanish learning.

Your task is to describe one single word in a clear academic dictionary style.

Rules:
- Focus on one word only.
- Do not translate whole sentences.
- Use a helpful school-dictionary tone.
- Return a structured entry with the following sections in this order:
1. Main translation
2. Word type
3. Pronunciation
4. Definitions
5. Common translations
6. Example sentences
7. Common expressions
8. Synonyms
9. Antonyms
10. Verb forms

Format the response as plain text with short sections and bullet points where useful.
Do not use markdown headings with #.
Do not use asterisks.
Use clear labels like: Main translation:, Word type:, Pronunciation:, Definitions:, Common translations:, Example sentences:, Common expressions:, Synonyms:, Antonyms:, Verb forms:

If the word is a verb, include simple verb forms when relevant.
If the word is not a verb, omit Verb forms.
If there are no common expressions, omit that section.
If there are no synonyms or antonyms, omit those sections.
Keep the response educational, concise, and useful for learners.

Word to define: ${translationInput}`;

    let searchContext = "";
    if (webSearch && !translationMode && !dictionaryMode && translationInput) {
      const { result: queryCompletion } = await runProviderCallWithRetry(
        {
          requestId,
          provider: "groq",
          model: "llama-3.1-8b-instant",
          stage: "query-generation",
        },
        async () =>
          groq.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: [
              {
                role: "system",
                content:
                  "You are a search query generator. Output only the most effective search query for the user's request. No quotes, no preamble.",
              },
              { role: "user", content: translationInput },
            ],
            temperature: 0,
          })
      );

      const generatedQuery =
        queryCompletion.choices?.[0]?.message?.content || translationInput;
      searchContext = await searchWeb(requestId, generatedQuery);
    }

    const systemPrompt = translationMode
      ? translationPrompt
      : dictionaryMode
        ? dictionaryPrompt
        : `
You are ThorAI, a multilingual virtual assistant.
${searchContext ? `
\n\nINFORMATION FROM THE INTERNET (CONTEXT ONLY):
${searchContext}

COPYRIGHT & SYNTHESIS RULES:
- Use the provided internet information ONLY as context to answer.
- NEVER reproduce copyrighted content literally. This includes:
  - DO NOT copy full song lyrics.
  - DO NOT copy full articles or news stories.
  - DO NOT copy full chapters of books, poems, scripts, or protected texts.
- If a user asks for full lyrics or protected content, politely decline and provide a helpful summary or analysis instead.
- Always synthesize information using your own words. Do not copy-paste segments from the search results.
` : ""}

IMPORTANT LANGUAGE RULE:
1. First detect the language of the user's CURRENT message.
2. Answer ONLY in that same language.
3. Do not use Spanish by default.
4. Do not follow the language of previous conversations.
5. The current user message language always has priority.

You are ThorAI:
- Helpful, Friendly, Accurate.
- Natural in conversation.
- Able to answer questions, explain concepts, help with programming and translate when requested.

Formatting rules:
- Do not use asterisks (*) anywhere.
- Do not use Markdown bold with **.
- Do not use Markdown lists with *.
- Use normal text and paragraphs.
- If you need a list, use hyphens (-) or numbered lists.
- Keep answers clean and natural.
- Keep normal conversations concise.
- When the user asks for a detailed explanation, provide a complete answer.

Response style:
${styleInstruction}

Never say you are a translator.
You are a virtual assistant.
`;

    const finalMessages: ChatMessage[] = translationMode
      ? [
          {
            role: "user",
            content: `Translate exactly this text and nothing else. Do not answer, solve, explain, or add commentary.\n\nText to translate:\n${translationInput}`,
          },
        ]
      : dictionaryMode
        ? [
            {
              role: "user",
              content: translationInput,
            },
          ]
        : conversationMessages;

    const maxTokens = translationMode ? 400 : dictionaryMode ? 1000 : 1400;

    const providerErrors: Array<{
      provider: ProviderName;
      model: string;
      status?: number;
      details: any;
    }> = [];

    const providerPlan: Array<{
      provider: ProviderName;
      model: string;
      execute: () => Promise<string>;
    }> = [
      {
        provider: "groq",
        model: "llama-3.3-70b-versatile",
        execute: () =>
          askGroq(
            requestId,
            "llama-3.3-70b-versatile",
            systemPrompt,
            finalMessages,
            maxTokens,
            "primary-answer"
          ),
      },
      {
        provider: "gemini",
        model: "gemini-3.5-flash",
        execute: () =>
          askGemini(
            requestId,
            systemPrompt,
            finalMessages,
            maxTokens,
            "fallback-answer"
          ),
      },
    ];

    if (openai) {
      providerPlan.push({
        provider: "openai",
        model: "gpt-4.1-mini",
        execute: () =>
          askOpenAI(
            requestId,
            systemPrompt,
            finalMessages,
            maxTokens,
            "fallback-answer"
          ),
      });
    }

    let response = "";

    for (const step of providerPlan) {
      try {
        response = await step.execute();
        console.log("PROVIDER SUCCESS", {
          requestId,
          provider: step.provider,
          model: step.model,
          textLength: response.length,
          time: nowIso(),
        });
        break;
      } catch (error: any) {
        const details = formatError(error);
        const status = extractStatusCode(error);

        providerErrors.push({
          provider: step.provider,
          model: step.model,
          status,
          details,
        });

        console.error("PROVIDER FAILED", {
          requestId,
          provider: step.provider,
          model: step.model,
          status,
          details,
          time: nowIso(),
        });

        if (status === 429) {
          console.log("PROVIDER RATE LIMITED, trying next provider", {
            requestId,
            provider: step.provider,
            model: step.model,
            time: nowIso(),
          });
        }
      }
    }

    if (!response) {
      const onlyRateLimits =
        providerErrors.length > 0 &&
        providerErrors.every((entry) => entry.status === 429);

      if (onlyRateLimits) {
        return NextResponse.json(
          {
            error:
              "Todos los proveedores de IA alcanzaron su limite de solicitudes. Intenta de nuevo en unos segundos.",
            code: "ALL_PROVIDERS_RATE_LIMITED",
            providers: providerErrors,
          },
          {
            status: 429,
          }
        );
      }

      return NextResponse.json(
        {
          error: "No se pudo obtener respuesta de los proveedores de IA.",
          code: "PROVIDERS_FAILED",
          providers: providerErrors,
        },
        {
          status: providerErrors[0]?.status ?? 502,
        }
      );
    }

    const cleanedResponse = response
      .replace(/\*\*/g, "")
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/^[\s]*(translation|translated|traduccion|traduccion:\s*|translation:\s*)/i, "")
      .trim();

    setCachedResponse(cacheKey, cleanedResponse);

    return NextResponse.json({
      response: cleanedResponse,
      cached: false,
    });
  } catch (error) {
    const errorDetails = formatError(error);
    console.error("ERROR THORAI", {
      requestId,
      errorDetails,
      time: nowIso(),
    });

    return NextResponse.json(
      {
        error: "ThorAI tuvo un problema al responder.",
        details: errorDetails,
      },
      {
        status: errorDetails.status ?? 500,
      }
    );
  }
}
