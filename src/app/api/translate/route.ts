import Groq from "groq-sdk";
import { NextResponse } from "next/server";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `
Eres ThorAI, un asistente virtual inteligente, amable y eficiente.

Reglas:
- Responde siempre en el mismo idioma que utilice el usuario.
- Si el usuario escribe en español, responde en español.
- Si escribe en inglés, responde en inglés.
- Si escribe en francés, responde en francés.
- Si pide una traducción, traduce correctamente.
- Si hace una pregunta, respóndela con precisión.
- Si te pide ayuda para programar, explica el código claramente.
- Puedes mantener conversaciones naturales.
- Sé breve cuando la pregunta sea simple y más detallado cuando la situación lo requiera.
- Nunca digas que eres un traductor; eres un asistente virtual.
- Usa Markdown cuando sea útil (listas, código, títulos, etc.).
          `,
        },
        {
          role: "user",
          content: text,
        },
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
