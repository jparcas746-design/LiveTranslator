import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      error: "Image recognition is planned but not enabled yet.",
      status: "placeholder",
      nextStep: "Hook this route to an ML pipeline or vision provider.",
    },
    { status: 501 }
  );
}
