import Groq from "groq-sdk";
import { NextResponse } from "next/server";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

/**
 * Helper function to search the web using Tavily API
 */
async function searchWeb(query: string) {
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
    const data = await response.json();
    if (!data.results) return "";
    
    return data.results
      .map((r: any) => `Source: ${r.title}\nContent: ${r.content}\nURL: ${r.url}`)
      .join("\n\n");
  } catch (error) {
    console.error("TAVILY ERROR:", error);
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
      webSearch = false, // Added support for webSearch
      sourceLanguage = "auto",
      targetLanguage = "en",
      text,
    } = await req.json();
    
    const conversationMessages = Array.isArray(messages) ? messages : [];

    const styleInstruction =
      responseStyle === "formal"
        ? "Use a professional, structured and academic communication style."
        : responseStyle === "casual"
          ? "When responseStyle is casual, ThorAI should sound like a close friend explaining something interesting.\n\nImagine you are explaining the topic to a friend sitting next to you, not writing an article.\n\nStyle rules:\n- Start naturally when appropriate with expressions like:\n  'Mira,'\n  'Básicamente,'\n  'La cosa es que...'\n  'En pocas palabras...'\n  'Te cuento...'\n\n- Avoid starting every answer like:\n  'X was a...'\n  'According to history...'\n  'The following is...'\n\n- Prefer storytelling and explanations over encyclopedia summaries.\n\n- React naturally to interesting facts:\n  'Lo curioso es que...'\n  'Aquí viene la parte interesante...'\n  'Lo más loco de esto es...'\n\n- Use light humor occasionally when it fits.\n\n- Use casual language, but remain intelligent and accurate.\n\n- Do not overuse slang."
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

    // WEB SEARCH LOGIC
    let searchContext = "";
    if (webSearch && !translationMode && !dictionaryMode && translationInput) {
      // 1. Generate optimized search query
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
      
      // 2. Perform Tavily Search
      searchContext = await searchWeb(generatedQuery);
    }

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
${searchContext ? `\n\nINFORMATION FOUND ON THE INTERNET:\n${searchContext}\n\nUse the internet information provided above to give an accurate, updated, and helpful response. If the information is relevant, synthesize it into your answer naturally.\n` : ""}

IMPORTANT LANGUAGE RULE:

1. First detect the language of the user's CURRENT message.
2. Answer ONLY in that same language.
3. Do not use Spanish by default.
4. Do not follow the language of previous conversations.
5. The current user message language always has priority.

Examples:

User:
Who is Lionel Messi?

Assistant:
Lionel Messi is an Argentine professional footballer widely considered one of the greatest players of all time.

---

User:
¿Quién es Lionel Messi?

Assistant:
Lionel Messi es un futbolista argentino considerado uno de los mejores jugadores de la historia.

---

User:
Qui est Lionel Messi?

Assistant:
Lionel Messi est un footballeur argentin considéré como l'un des meilleurs joueurs de l'histoire.

---

You are ThorAI:
- Helpful.
- Friendly.
- Accurate.
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
- When the user asks for a detailed explanation, provide a complete answer. Responses can be long (up to around 1000 words) when necessary. Do not artificially shorten useful information.

Response style:
${styleInstruction}

Never say you are a translator.
You are a virtual assistant.
`,
        },
        ...(translationMode
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
    console.error("ERROR THORAI:", error);

    return NextResponse.json(
      {
        response: "ThorAI tuvo un problema al responder.",
      },
      {
        status: 500,
      }
    );
  }
}