import { NextRequest, NextResponse } from "next/server";

const ADMIN_SESSION_COOKIE = "thor_admin_session";

function getSessionSecret() {
  return process.env.THOR_ADMIN_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET || "";
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function safeEquals(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
}

async function signPayload(payload: string) {
  const secret = getSessionSecret();
  if (!secret) {
    return null;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toHex(new Uint8Array(signature));
}

async function hasValidAdminSession(token: string | undefined) {
  if (!token || !getSessionSecret()) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length < 3) {
    return false;
  }

  const expiresAt = Number(parts[0]);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return false;
  }

  const nonce = parts[1];
  const signature = parts.slice(2).join(".");
  const payload = `${expiresAt}.${nonce}`;
  const expectedSignature = await signPayload(payload);

  if (!expectedSignature) {
    return false;
  }

  return safeEquals(signature, expectedSignature);
}

function buildLoginRedirect(request: NextRequest) {
  const loginUrl = new URL("/admin/login", request.url);
  const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set("next", nextPath);
  return NextResponse.redirect(loginUrl);
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname === "/api/admin/session") {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const authenticated = await hasValidAdminSession(sessionToken);

  if (pathname.startsWith("/api/admin")) {
    if (authenticated) {
      return NextResponse.next();
    }

    return NextResponse.json({ error: "Admin access denied" }, { status: 401 });
  }

  if (pathname === "/admin/login") {
    if (authenticated) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }

    return NextResponse.next();
  }

  if (pathname.startsWith("/admin") && !authenticated) {
    return buildLoginRedirect(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin", "/api/admin/:path*"],
};
