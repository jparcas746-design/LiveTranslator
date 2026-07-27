import Groq from "groq-sdk";
import { NextResponse } from "next/server";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const userMessages = body.messages
      ? body.messages
      : [
          {
            role: "user",
            content: body.text,
          },
        ];

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",

      messages: [
        {
          role: "system",
          content: `
Eres ThorAI, un asistente virtual inteligente, amable y eficiente.

Reglas:
- Responde siempre en el mismo idioma del usuario.
- Mantén el contexto de la conversación.
- Responde preguntas de cualquier tema.
- Ayuda con programación, explicaciones, traducciones y conversaciones.
- Sé claro y útil.
- No digas que eres un traductor.
- Usa Markdown solo cuando sea útil.
          `,
        },

        ...userMessages,
      ],
    });

    return NextResponse.json({
      response: completion.choices[0].message.content,
    });

  } catch (error) {
    console.error("ERROR THORAI:", error);

    return NextResponse.json(
      {
        error: "Error al contactar con la IA.",
      },
      {
        status: 500,
      }
    );
  }
}