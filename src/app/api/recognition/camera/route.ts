import { handleRecognitionRequest } from "@/app/api/recognition/_shared";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleRecognitionRequest(request);
}
