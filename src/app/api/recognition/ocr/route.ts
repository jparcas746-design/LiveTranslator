import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      error: "OCR recognition is planned but not enabled yet.",
      status: "placeholder",
    },
    { status: 501 }
  );
}
