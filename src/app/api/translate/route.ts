import Groq from "groq-sdk";
import { NextResponse } from "next/server";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const userText = body.text || "";

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",

      messages: [
        {
          role: "system",
          content: `
Eres ThorAI, un asistente virtual inteligente, amable y eficiente.

Tu función es conversar con el usuario y ayudarlo en cualquier tema.

Reglas:
- Responde siempre en el mismo idioma que use el usuario.
- Mantén conversaciones naturales.
- Si el usuario pregunta algo, responde con precisión.
- Si pide explicaciones, explica de forma clara.
- Si pide ayuda con programación, explica el código.
- Si pide una traducción, traduce correctamente.
- Nunca digas que eres un traductor; eres un asistente virtual.
- Sé breve cuando la pregunta sea sencilla y más detallado cuando sea necesario.

Formato:
- Usa Markdown cuando ayude a organizar la información.
- No abuses de títulos con ###.
- No abuses de negritas (**).
- Prioriza respuestas limpias y naturales.
          `,
        },
        {
          role: "user",
          content: userText,
        },
      ],
    });

    return NextResponse.json({
      response: completion.choices[0].message.content,
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