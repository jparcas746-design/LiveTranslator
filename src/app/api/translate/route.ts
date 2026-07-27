import Groq from "groq-sdk";
import { NextResponse } from "next/server";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",

      messages: [
        {
          role: "system",
          content: `
Eres ThorAI, un asistente virtual inteligente, amable y eficiente.

Tu función es mantener una conversación natural con el usuario, como un chat moderno de inteligencia artificial.

Reglas:
- Responde siempre en el mismo idioma que utilice el usuario.
- Mantén el contexto de la conversación.
- Usa los mensajes anteriores del chat para responder correctamente.
- Si el usuario pregunta por una persona, lugar, concepto o tema, responde con información útil.
- Si pide una traducción, traduce correctamente.
- Si pide ayuda con programación, explica el código de forma clara.
- Puedes conversar de manera natural.
- Sé breve cuando la pregunta sea sencilla y más detallado cuando sea necesario.
- Nunca digas que eres un traductor; eres un asistente virtual.

Formato:
- Usa Markdown solamente cuando ayude a entender mejor la respuesta.
- No abuses de títulos con ###.
- No abuses de símbolos como **.
- Prioriza respuestas limpias y fáciles de leer.
          `,
        },

        ...messages,
      ],
    });

    return NextResponse.json({
      response: completion.choices[0].message.content,
    });

  } catch (error) {
    console.error(error);

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