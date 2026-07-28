import { NextResponse } from "next/server";
import { hasValidAdminSession } from "@/thor/utils/adminSession";

const ADMIN_SESSION_COOKIE = "thor_admin_session";

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

export function isAdminAuthorized(request: Request) {
  const expected = process.env.THOR_ADMIN_KEY;
  const sessionToken = readSessionCookie(request);
  const sessionOk = hasValidAdminSession(sessionToken);

  console.log("ADMIN_AUTH_CHECK", {
    path: new URL(request.url).pathname,
    hasSessionToken: Boolean(sessionToken),
    sessionOk,
    hasAdminKeyConfig: Boolean(expected),
  });

  if (sessionOk) {
    return {
      ok: true,
      reason: undefined,
    };
  }

  const received =
    request.headers.get("x-thor-admin-key") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";

  if (!expected) {
    return {
      ok: false,
      reason: "THOR_ADMIN_KEY is not configured and no admin session is active",
    };
  }

  return {
    ok: received === expected,
    reason: received === expected ? undefined : "Invalid admin key",
  };
}

export function requireAdmin(request: Request) {
  const result = isAdminAuthorized(request);
  if (result.ok) {
    return null;
  }

  return NextResponse.json(
    {
      error: "Admin access denied",
      details: result.reason,
    },
    { status: 401 }
  );
}
