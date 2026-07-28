import Groq from "groq-sdk";
import { NextResponse } from "next/server";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

/**
 * Helper function to search the web using Tavily API with full debugging
 */
async function searchWeb(query: string) {
  console.log("--- INICIANDO LLAMADA A TAVILY ---");
  console.log("QUERY ENVIADA A TAVILY:", query);
  
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: query,
        search_depth: "smart",
        max_results: 5,
      }),
    });

    console.log("TAVILY HTTP STATUS:", response.status);

    const rawText = await response.text();
    console.log("TAVILY RAW RESPONSE BODY:", rawText);

    // Parseamos el texto después de haberlo logueado
    const data = JSON.parse(rawText);

    if (!data.results || data.results.length === 0) {
      console.log("AVISO: Tavily no devolvió resultados para esta consulta.");
      return "";
    }
    
    const formattedResults = data.results
      .map((r: any) => `Source: ${r.title}\nContent: ${r.content}\nURL: ${r.url}`)
      .join("\n\n");

    console.log("RESULTADOS FORMATEADOS CORRECTAMENTE (Longitud:", formattedResults.length, ")");
    return formattedResults;
  } catch (error) {
    console.error("ERROR CRÍTICO EN SEARCHWEB:", error);
    return "";
  }
}

export async function POST(req: Request) {
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
    
    console.log("WEB SEARCH ENABLED (REQUEST):", webSearch);
    console.log("TAVILY API KEY EXISTS:", !!process.env.TAVILY_API_KEY);

    const conversationMessages = Array.isArray(messages) ? messages : [];

    // Lógica de estilos
    const styleInstruction =
      responseStyle === "formal"
        ? "Use a professional, structured and academic communication style."
        : responseStyle === "casual"
          ? "When responseStyle is casual, ThorAI should sound like a close friend explaining something interesting.\n\nImagine you are explaining the topic to a friend sitting next to you, not writing an article.\n\nStyle rules:\n- Start naturally when appropriate with expressions like:\n  'Mira,'\n  'Básicamente,'\n  'La cosa es que...'\n  'En pocas palabras...'\n  'Te cuento...'\n\n- Avoid starting every answer like:\n  'X was a...'\n  'According to history...'\n  'The following is...'\n\n- Prefer storytelling and explanations over encyclopedia summaries.\n\n- React naturally to interesting facts:\n  'Lo curioso es que...'\n  'Aquí viene la parte interesante...'\n  'Lo más loco de esto es...'\n\n- Use light humor occasionally when it fits.\n\n- Use casual language, but remain intelligent and accurate.\n\n- Do not overuse slang."
          : "Use a natural and friendly communication style.";

    // Lógica de traducción
    const translationPrompt = `You are in Translation Mode.\n\nYour only task is to translate the user's exact words from the source language to the target language.\n\nTreat every user message as text to translate, never as a request to answer, solve, explain, summarize, or analyze.\n\nNEVER:\n- Answer questions.\n- Solve mathematical problems.\n- Explain concepts.\n- Give additional information.\n- Change the meaning.\n- Add commentary such as "Translation:", "The answer is", or any explanation.\n\nRules:\n- Return ONLY the translated text.\n- Preserve the original meaning and natural phrasing.\n- Keep the same intent, tone, and sentence structure as much as possible.\n- If the input is a question, command, math sentence, or historical statement, translate it as text only.\n\nSource language: ${sourceLanguage === "auto" ? "auto-detected" : sourceLanguage}\nTarget language: ${targetLanguage}`;

    const translationInput =
      typeof text === "string" && text.trim()
        ? text
        : conversationMessages.length > 0
          ? conversationMessages[conversationMessages.length - 1]?.content ?? ""
          : "";

    // Lógica de diccionario
    const dictionaryPrompt = `You are a bilingual educational dictionary assistant for Spanish-English and English-Spanish learning.\n\nYour task is to describe one single word in a clear academic dictionary style.\n\nRules:\n- Focus on one word only.\n- Do not translate whole sentences.\n- Use a helpful school-dictionary tone.\n- Return a structured entry with the following sections in this order:\n1. Main translation\n2. Word type\n3. Pronunciation\n4. Definitions\n5. Common translations\n6. Example sentences\n7. Common expressions\n8. Synonyms\n9. Antonyms\n10. Verb forms\n\nFormat the response as plain text with short sections and bullet points where useful.\nDo not use markdown headings with #.\nDo not use asterisks.\nUse clear labels like: Main translation:, Word type:, Pronunciation:, Definitions:, Common translations:, Example sentences:, Common expressions:, Synonyms:, Antonyms:, Verb forms:`;

    // --- FLUJO DE BÚSQUEDA WEB ---
    let searchContext = "";
    if (webSearch && !translationMode && !dictionaryMode && translationInput) {
      console.log("--- GENERANDO QUERY DE BÚSQUEDA CON LLAMA 3.1 8B ---");
      const queryCompletion = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [
          { 
            role: "system", 
            content: "You are a search query generator. Output only the most effective search query for the user's request. No quotes, no preamble." 
          },
          { role: "user", content: translationInput }
        ],
        temperature: 0,
      });
      
      const generatedQuery = queryCompletion.choices[0]?.message?.content || translationInput;
      console.log("GENERATED QUERY:", generatedQuery);
      
      searchContext = await searchWeb(generatedQuery);
      console.log("WEB SEARCH RESULT (CONTEXT READY):", searchContext ? "SÍ (Contenido obtenido)" : "NO (Vacio)");
    }

    // --- CONSTRUCCIÓN DEL SYSTEM PROMPT ---
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      max_tokens: translationMode ? 400 : dictionaryMode ? 1000 : 1400,
      messages: [
        {
          role: "system",
          content: translationMode
            ? translationPrompt
            : dictionaryMode
              ? dictionaryPrompt
              : `
You are ThorAI, a multilingual virtual assistant.
${searchContext ? `
\n\nINFORMATION FOUND ON THE INTERNET:
${searchContext}

COPYRIGHT & SYNTHESIS RULES:
- Use the provided internet information ONLY as context to answer.
- NEVER reproduce copyrighted content literally.
- DO NOT copy full song lyrics, full articles, or chapters of books.
- Politely decline requests for protected content and offer a summary instead.
- Always synthesize information using your own words.
` : ""}

IMPORTANT LANGUAGE RULE:
1. First detect the language of the user's CURRENT message.
2. Answer ONLY in that same language.
3. Do not use Spanish by default.
4. Do not follow the language of previous conversations.
5. The current user message language always has priority.

Examples:
User: Who is Lionel Messi?
Assistant: Lionel Messi is an Argentine professional footballer...

You are ThorAI:
- Helpful, Friendly, Accurate.
- Natural in conversation.

Formatting rules:
- Do not use asterisks (*) anywhere.
- Do not use Markdown bold with **.
- Do not use Markdown lists with *.
- Use normal text and paragraphs.
- If you need a list, use hyphens (-) or numbered lists.

Response style:
${styleInstruction}

Never say you are a translator. You are a virtual assistant.
`,
        },
        ...(translationMode
          ? [{ role: "user", content: `Translate exactly this text:\n${translationInput}` }]
          : dictionaryMode
            ? [{ role: "user", content: translationInput }]
            : conversationMessages),
      ],
    });

    const response = completion.choices[0].message.content ?? "";
    const cleanedResponse = response
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/^\s*(translation|translated|traducción|traducción:\s*|translation:\s*)/i, "")
      .trim();

    return NextResponse.json({
      response: cleanedResponse,
    });
  } catch (error) {
    console.error("ERROR GENERAL THORAI:", error);
    return NextResponse.json(
      { response: "ThorAI tuvo un problema al responder." },
      { status: 500 }
    );
  }
}