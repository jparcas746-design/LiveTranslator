import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    console.log("RECIBIDO:", body);

    return NextResponse.json({
      response: "ThorAI funciona correctamente ⚡",
    });

  } catch (error) {
    console.error("ERROR API:", error);

    return NextResponse.json(
      {
        error: "Fallo en la API",
      },
      {
        status: 500,
      }
    );
  }
}