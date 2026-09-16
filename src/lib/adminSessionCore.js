import crypto from "node:crypto";

export const ADMIN_SESSION_COOKIE = "vp_admin_session";
const ADMIN_ROLE = "admin";
const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
export const DEFAULT_ADMIN_PATH = "/admin/resources";

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for admin sessions");
  return secret;
}

function getAdminKey() {
  const adminKey = process.env.PORTAL_ADMIN_KEY;
  if (!adminKey?.trim()) throw new Error("PORTAL_ADMIN_KEY is required for admin authentication");
  return adminKey;
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodePayload(value) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function signPayload(encodedPayload) {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function sanitizeNextPath(input) {
  if (typeof input !== "string") return DEFAULT_ADMIN_PATH;
  const trimmed = input.trim();
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return DEFAULT_ADMIN_PATH;
  }
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    decoded.startsWith("//") ||
    trimmed.includes("\\") ||
    decoded.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(decoded)
  ) {
    return DEFAULT_ADMIN_PATH;
  }
  return trimmed;
}

export function verifyAdminKey(candidate) {
  const normalizedCandidate = typeof candidate === "string" ? candidate.trim() : "";
  const expectedKey = getAdminKey().trim();
  return safeEqual(normalizedCandidate, expectedKey);
}

export function createAdminSessionToken() {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    role: ADMIN_ROLE,
    iat: now,
    exp: now + ADMIN_SESSION_MAX_AGE_SECONDS,
  };
  const encodedPayload = encodePayload(payload);
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function verifyAdminSessionToken(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) return null;
  const expectedSignature = signPayload(encodedPayload);
  if (!safeEqual(signature, expectedSignature)) return null;
  const payload = decodePayload(encodedPayload);
  if (
    !payload ||
    payload.role !== ADMIN_ROLE ||
    !Number.isInteger(payload.iat) ||
    !Number.isInteger(payload.exp) ||
    payload.iat > payload.exp ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    return null;
  }
  return payload;
}

export function getAdminSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  };
}
