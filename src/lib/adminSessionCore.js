import crypto from "node:crypto";
import { isAdminRole } from "./adminRoles.js";

export const ADMIN_SESSION_COOKIE = "vp_admin_session";
const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
export const DEFAULT_ADMIN_PATH = "/";

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for admin sessions");
  return secret;
}

export function isAdminLoginConfigured() {
  return Boolean(
    process.env.SESSION_SECRET?.trim() &&
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim()
  );
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
  const pathname = new URL(trimmed, "https://portal.invalid").pathname;
  if (pathname === "/login" || pathname.startsWith("/api/")) return DEFAULT_ADMIN_PATH;
  return trimmed;
}

export function createAdminSessionToken(identity) {
  if (!identity || identity.provider !== "firebase" || !isAdminRole(identity.role) || typeof identity.uid !== "string" || !identity.uid.trim()) {
    throw new Error("A valid admin identity is required");
  }
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    role: identity.role,
    sub: identity.uid.trim(),
    name: typeof identity.name === "string" ? identity.name.trim().slice(0, 120) : "",
    email: typeof identity.email === "string" ? identity.email.trim().toLowerCase().slice(0, 254) : "",
    provider: "firebase",
    mustChangePassword: identity.mustChangePassword === true,
    iat: now,
    exp: now + ADMIN_SESSION_MAX_AGE_SECONDS,
  };
  const encodedPayload = encodePayload(payload);
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function verifyAdminSessionToken(token) {
  if (typeof token !== "string" || token.length > 4096 || !process.env.SESSION_SECRET) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) return null;
  const expectedSignature = signPayload(encodedPayload);
  if (!safeEqual(signature, expectedSignature)) return null;
  const payload = decodePayload(encodedPayload);
  if (
    !payload ||
    !isAdminRole(payload.role) ||
    typeof payload.sub !== "string" ||
    !payload.sub ||
    typeof payload.name !== "string" ||
    typeof payload.email !== "string" ||
    payload.provider !== "firebase" ||
    typeof payload.mustChangePassword !== "boolean" ||
    !Number.isInteger(payload.iat) ||
    !Number.isInteger(payload.exp) ||
    payload.iat > payload.exp ||
    payload.iat > Math.floor(Date.now() / 1000) + 60 ||
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
