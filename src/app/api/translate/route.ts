import Groq from "groq-sdk";
import { NextResponse } from "next/server";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { messages = [], responseStyle = "balanced" } = await req.json();
    const conversationMessages = Array.isArray(messages) ? messages : [];

    const styleInstruction =
      responseStyle === "formal"
        ? "Use a professional, structured and academic communication style."
        : responseStyle === "casual"
          ? "Talk like a knowledgeable friend. Be relaxed, conversational and use light humor when appropriate."
          : "Use a natural and friendly communication style.";

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",

      messages: [
        {
          role: "system",
          content: `
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
        ...conversationMessages,
      ],
    });

    const response = completion.choices[0].message.content ?? "";
    const cleanedResponse = response
      .replace(/\*\*/g, "")
      .replace(/\*/g, "");

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