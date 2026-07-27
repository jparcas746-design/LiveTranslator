import Groq from "groq-sdk";
import { NextResponse } from "next/server";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    const {
      messages = [],
      responseStyle = "balanced",
      translationMode = false,
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

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content: translationMode
            ? translationPrompt
            : `
You are ThorAI, a multilingual virtual assistant.

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
Lionel Messi est un footballeur argentin considéré comme l'un des meilleurs joueurs de l'histoire.

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