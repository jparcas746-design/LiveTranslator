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

Tu objetivo es ayudar al usuario de forma natural, clara y útil.

Reglas:
- Responde siempre en el mismo idioma que utilice el usuario.
- Mantén el contexto de la conversación.
- Recuerda los mensajes anteriores del chat para responder mejor.
- Si el usuario cambia de tema, adáptate.
- Si pide una traducción, traduce correctamente.
- Si hace una pregunta, respóndela con precisión.
- Si pide ayuda para programar, explica claramente.
- Puedes mantener conversaciones naturales.
- Sé breve cuando sea simple y detallado cuando sea necesario.
- Nunca digas que eres un traductor; eres un asistente virtual.

Formato:
- Usa Markdown solo cuando mejore la claridad.
- No abuses de títulos con ###.
- No abuses de negritas (**texto**).
- Prioriza respuestas limpias y naturales.
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
      { error: "Error al contactar con la IA." },
      { status: 500 }
    );
  }
}