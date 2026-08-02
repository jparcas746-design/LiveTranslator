import { createHmac, timingSafeEqual } from "crypto";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function getSessionSecret() {
  return process.env.THOR_ADMIN_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET || "";
}

function signPayload(payload: string) {
  const secret = getSessionSecret();
  if (!secret) {
    return null;
  }

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
  return process.env.ADMIN_PASSWORD || process.env.THOR_ADMIN_PASSWORD || "";
}

export function createAdminSession() {
  const secret = getSessionSecret();
  if (!secret) {
    return null;
  }

  const expiresAt = Date.now() + SESSION_TTL_MS;
  const nonce =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  const payload = `${expiresAt}.${nonce}`;
  const signature = signPayload(payload);
  if (!signature) {
    return null;
  }

  return `${payload}.${signature}`;
}

export function hasValidAdminSession(token: string | null | undefined) {
  if (!getSessionSecret()) {
    console.warn("ADMIN_SESSION_VALIDATE", { ok: false, reason: "missing_session_secret" });
    return false;
  }

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
  if (!expectedSignature) {
    console.warn("ADMIN_SESSION_VALIDATE", { ok: false, reason: "missing_signature_secret" });
    return false;
  }

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
