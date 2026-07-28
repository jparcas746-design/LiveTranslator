import { NextResponse } from "next/server";

export function isAdminAuthorized(request: Request) {
  const expected = process.env.THOR_ADMIN_KEY;
  if (!expected) {
    return {
      ok: false,
      reason: "THOR_ADMIN_KEY is not configured",
    };
  }

  const received =
    request.headers.get("x-thor-admin-key") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";

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
