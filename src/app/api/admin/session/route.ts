import { NextResponse } from "next/server";
import {
  createAdminSession,
  getAdminPassword,
  hasValidAdminSession,
  revokeAdminSession,
} from "@/thor/utils/adminSession";

const ADMIN_SESSION_COOKIE = "thor_admin_session";

function shouldUseSecureCookie(request: Request) {
  const url = new URL(request.url);
  if (url.protocol === "https:") {
    return true;
  }

  const forwardedProto = request.headers.get("x-forwarded-proto") || "";
  return forwardedProto.split(",").some((value) => value.trim() === "https");
}

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
  if (!expectedPassword) {
    return NextResponse.json(
      { error: "Admin password is not configured. Set ADMIN_PASSWORD in environment variables." },
      { status: 500 }
    );
  }

  if (password !== expectedPassword) {
    return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 });
  }

  const token = createAdminSession();
  if (!token) {
    return NextResponse.json(
      { error: "Admin session secret is not configured. Set THOR_ADMIN_SESSION_SECRET in environment variables." },
      { status: 500 }
    );
  }

  const response = NextResponse.json({ authenticated: true });
  const secure = shouldUseSecureCookie(request);
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 8 * 60 * 60,
  });

  return response;
}

export async function DELETE(request: Request) {
  const token = readSessionCookie(request);
  revokeAdminSession(token);

  const response = NextResponse.json({ authenticated: false });
  const secure = shouldUseSecureCookie(request);
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0,
  });

  return response;
}
