import { NextResponse } from "next/server";
import {
  createAdminSession,
  getAdminPassword,
  hasValidAdminSession,
  revokeAdminSession,
} from "@/thor/utils/adminSession";

const ADMIN_SESSION_COOKIE = "thor_admin_session";
const IS_PROD = process.env.NODE_ENV === "production";

function readSessionCookie(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  const entries = cookie.split(";").map((item) => item.trim());
  const found = entries.find((entry) => entry.startsWith(`${ADMIN_SESSION_COOKIE}=`));
  if (!found) {
    return null;
  }

  const value = found.split("=").slice(1).join("=");
  return value || null;
}

export async function GET(request: Request) {
  const token = readSessionCookie(request);
  const authenticated = hasValidAdminSession(token);

  return NextResponse.json({ authenticated });
}

export async function POST(request: Request) {
  let password = "";

  try {
    const body = (await request.json()) as { password?: string };
    password = String(body?.password || "");
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const expectedPassword = getAdminPassword();
  if (password !== expectedPassword) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = createAdminSession();
  const response = NextResponse.json({ authenticated: true });
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PROD,
    path: "/",
    maxAge: 8 * 60 * 60,
  });

  return response;
}

export async function DELETE(request: Request) {
  const token = readSessionCookie(request);
  revokeAdminSession(token);

  const response = NextResponse.json({ authenticated: false });
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PROD,
    path: "/",
    maxAge: 0,
  });

  return response;
}
