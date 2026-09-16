import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

process.env.SESSION_SECRET = "test-session-secret-with-sufficient-entropy";
process.env.PORTAL_ADMIN_KEY = "test-admin-key";

const {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  getAdminSessionCookieOptions,
  sanitizeNextPath,
  verifyAdminKey,
  verifyAdminSessionToken,
} = await import("./adminSessionCore.js");

function signedToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", process.env.SESSION_SECRET)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

test("creates and verifies a signed admin session", () => {
  const token = createAdminSessionToken();
  const session = verifyAdminSessionToken(token);
  assert.equal(session.role, "admin");
  assert.ok(session.exp > session.iat);
  assert.equal(ADMIN_SESSION_COOKIE, "vp_admin_session");
});

test("rejects tampered, expired, malformed, and extra-part tokens", () => {
  const token = createAdminSessionToken();
  const [payload, signature] = token.split(".");
  const replacement = signature.endsWith("a") ? "b" : "a";
  assert.equal(verifyAdminSessionToken(`${payload}.${signature.slice(0, -1)}${replacement}`), null);
  assert.equal(verifyAdminSessionToken(`${token}.extra`), null);
  assert.equal(verifyAdminSessionToken("not-a-token"), null);
  assert.equal(
    verifyAdminSessionToken(
      signedToken({ role: "admin", iat: 1, exp: Math.floor(Date.now() / 1000) - 1 })
    ),
    null
  );
  assert.equal(
    verifyAdminSessionToken(
      signedToken({ role: "viewer", iat: 1, exp: Math.floor(Date.now() / 1000) + 60 })
    ),
    null
  );
});

test("validates admin keys using exact values after outer whitespace", () => {
  assert.equal(verifyAdminKey(" test-admin-key "), true);
  assert.equal(verifyAdminKey("test-admin-key-wrong"), false);
  assert.equal(verifyAdminKey(null), false);
});

test("sanitizes redirect targets and emits secure cookie options", () => {
  assert.equal(sanitizeNextPath("/admin/questionnaires"), "/admin/questionnaires");
  assert.equal(sanitizeNextPath("https://example.com"), "/admin/resources");
  assert.equal(sanitizeNextPath("//example.com"), "/admin/resources");
  assert.equal(sanitizeNextPath("/\\example.com"), "/admin/resources");
  assert.equal(sanitizeNextPath("/%5C%5Cexample.com"), "/admin/resources");
  const options = getAdminSessionCookieOptions();
  assert.equal(options.httpOnly, true);
  assert.equal(options.sameSite, "lax");
  assert.equal(options.path, "/");
  assert.equal(options.maxAge, 43_200);
});
