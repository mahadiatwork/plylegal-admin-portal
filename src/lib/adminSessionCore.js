import crypto from "node:crypto";

export const ADMIN_SESSION_COOKIE = "vp_admin_session";
const ADMIN_ROLE = "admin";
const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
export const DEFAULT_ADMIN_PATH = "/";

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for admin sessions");
  return secret;
}

function getAdminKey() {
  const adminKey = process.env.PORTAL_ADMIN_PASSWORD || process.env.PORTAL_ADMIN_KEY;
  if (!adminKey?.trim()) throw new Error("PORTAL_ADMIN_PASSWORD is required for admin authentication");
  return adminKey;
}

export function getAdminUsername() {
  return process.env.PORTAL_ADMIN_USERNAME?.trim() || "admin";
}

export function isAdminLoginConfigured() {
  return Boolean(process.env.SESSION_SECRET?.trim() &&
    (process.env.PORTAL_ADMIN_PASSWORD || process.env.PORTAL_ADMIN_KEY)?.trim());
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

export function verifyAdminCredentials(username, password) {
  const expectedPassword = getAdminKey();
  const suppliedUsername = typeof username === "string" ? username.trim() : "";
  const suppliedPassword = typeof password === "string" ? password : "";
  const digest = (value) => crypto.createHash("sha256").update(value).digest();
  const usernameMatches = crypto.timingSafeEqual(digest(suppliedUsername), digest(getAdminUsername()));
  const passwordMatches = crypto.timingSafeEqual(digest(suppliedPassword), digest(expectedPassword));
  return usernameMatches && passwordMatches;
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
    sub: getAdminUsername(),
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
    payload.role !== ADMIN_ROLE ||
    payload.sub !== getAdminUsername() ||
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
