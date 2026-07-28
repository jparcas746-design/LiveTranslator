import { createHmac, timingSafeEqual } from "crypto";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function getSessionSecret() {
  return process.env.THOR_ADMIN_SESSION_SECRET || "thor-admin-session-secret-change-me";
}

function signPayload(payload: string) {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
}

function safeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function getAdminPassword() {
  return process.env.THOR_ADMIN_PASSWORD || "kirogatitotierno7u7";
}

export function createAdminSession() {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const nonce =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  const payload = `${expiresAt}.${nonce}`;
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

export function hasValidAdminSession(token: string | null | undefined) {
  if (!token) {
    console.log("ADMIN_SESSION_VALIDATE", { ok: false, reason: "missing_token" });
    return false;
  }

  const parts = token.split(".");
  if (parts.length < 3) {
    console.log("ADMIN_SESSION_VALIDATE", {
      ok: false,
      reason: "invalid_format",
      tokenLength: token.length,
    });
    return false;
  }

  const expiresAtRaw = parts[0];
  const nonce = parts[1];
  const signature = parts.slice(2).join(".");

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt)) {
    console.log("ADMIN_SESSION_VALIDATE", {
      ok: false,
      reason: "invalid_expiration",
      expiresAtRaw,
    });
    return false;
  }

  if (expiresAt <= Date.now()) {
    console.log("ADMIN_SESSION_VALIDATE", {
      ok: false,
      reason: "expired",
      expiresAt,
      now: Date.now(),
    });
    return false;
  }

  const payload = `${expiresAt}.${nonce}`;
  const expectedSignature = signPayload(payload);

  const valid = safeEquals(signature, expectedSignature);

  console.log("ADMIN_SESSION_VALIDATE", {
    ok: valid,
    reason: valid ? "valid" : "signature_mismatch",
    expiresAt,
    tokenLength: token.length,
  });

  return valid;
}

export function revokeAdminSession(_token: string | null | undefined) {
  return;
}
