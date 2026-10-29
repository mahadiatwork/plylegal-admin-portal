import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

process.env.SESSION_SECRET = "test-session-secret-with-sufficient-entropy";
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "test-firebase-api-key";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "test-firebase-project";

const {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  getAdminSessionCookieOptions,
  sanitizeNextPath,
  isAdminLoginConfigured,
  verifyAdminSessionToken,
} = await import("./adminSessionCore.js");
const { ADMIN_ROLES, canAccessQuestionnaireBuilder, canManageAdminUsers } = await import("./adminRoles.js");

const superAdminIdentity = {
  uid: "firebase-super-admin",
  name: "Super Admin",
  email: "admin@example.com",
  role: ADMIN_ROLES.SUPER_ADMIN,
  provider: "firebase",
  mustChangePassword: false,
};

function signedToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", process.env.SESSION_SECRET)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

test("creates and verifies a signed admin session", () => {
  const token = createAdminSessionToken(superAdminIdentity);
  const session = verifyAdminSessionToken(token);
  assert.equal(session.role, ADMIN_ROLES.SUPER_ADMIN);
  assert.equal(session.sub, "firebase-super-admin");
  assert.equal(session.name, "Super Admin");
  assert.equal(session.email, "admin@example.com");
  assert.equal(session.provider, "firebase");
  assert.equal(session.mustChangePassword, false);
  assert.ok(session.exp > session.iat);
  assert.equal(ADMIN_SESSION_COOKIE, "vp_admin_session");
});

test("creates role-aware Firebase staff sessions", () => {
  const session = verifyAdminSessionToken(createAdminSessionToken({
    uid: "firebase-user-1",
    name: "Sam Support",
    email: "SAM@example.com",
    role: ADMIN_ROLES.SALES_SUPPORT,
    provider: "firebase",
    mustChangePassword: true,
  }));
  assert.equal(session.sub, "firebase-user-1");
  assert.equal(session.email, "sam@example.com");
  assert.equal(session.role, ADMIN_ROLES.SALES_SUPPORT);
  assert.equal(session.mustChangePassword, true);
  assert.equal(canAccessQuestionnaireBuilder(session.role), false);
  assert.equal(canManageAdminUsers(session.role), false);
  assert.equal(canAccessQuestionnaireBuilder(ADMIN_ROLES.SUPER_ADMIN), true);
  assert.equal(canManageAdminUsers(ADMIN_ROLES.SUPER_ADMIN), true);
});

test("rejects tampered, expired, malformed, and extra-part tokens", () => {
  const token = createAdminSessionToken(superAdminIdentity);
  const [payload, signature] = token.split(".");
  const replacement = signature.endsWith("a") ? "b" : "a";
  assert.equal(verifyAdminSessionToken(`${payload}.${signature.slice(0, -1)}${replacement}`), null);
  assert.equal(verifyAdminSessionToken(`${token}.extra`), null);
  assert.equal(verifyAdminSessionToken("not-a-token"), null);
  assert.equal(
    verifyAdminSessionToken(
      signedToken({ role: "admin", sub: "firebase-user", name: "Admin", email: "admin@example.com", provider: "firebase", mustChangePassword: false, iat: 1, exp: Math.floor(Date.now() / 1000) - 1 })
    ),
    null
  );
  assert.equal(
    verifyAdminSessionToken(
      signedToken({ role: "viewer", sub: "firebase-user", name: "Viewer", email: "viewer@example.com", provider: "firebase", mustChangePassword: false, iat: 1, exp: Math.floor(Date.now() / 1000) + 60 })
    ),
    null
  );
});

test("rejects non-Firebase and incomplete identities", () => {
  assert.throws(() => createAdminSessionToken(), /valid admin identity/);
  assert.throws(() => createAdminSessionToken({ ...superAdminIdentity, provider: "legacy" }), /valid admin identity/);
  assert.throws(() => createAdminSessionToken({ ...superAdminIdentity, uid: "" }), /valid admin identity/);
});

test("sanitizes redirect targets and emits secure cookie options", () => {
  assert.equal(sanitizeNextPath("/admin/questionnaires"), "/admin/questionnaires");
  assert.equal(sanitizeNextPath("https://example.com"), "/");
  assert.equal(sanitizeNextPath("//example.com"), "/");
  assert.equal(sanitizeNextPath("/\\example.com"), "/");
  assert.equal(sanitizeNextPath("/%5C%5Cexample.com"), "/");
  assert.equal(sanitizeNextPath("/login?next=/login"), "/");
  assert.equal(sanitizeNextPath("/api/resources"), "/");
  assert.equal(sanitizeNextPath("/matter/482/resources?scope=all"), "/matter/482/resources?scope=all");
  const options = getAdminSessionCookieOptions();
  assert.equal(options.httpOnly, true);
  assert.equal(options.sameSite, "lax");
  assert.equal(options.path, "/");
  assert.equal(options.maxAge, 43_200);
});

test("login configuration requires Firebase and ignores legacy account variables", () => {
  assert.equal(isAdminLoginConfigured(), true);
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  process.env.PORTAL_ADMIN_USERNAME = "legacy-admin";
  process.env.PORTAL_ADMIN_PASSWORD = "legacy-password";
  try {
    delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    assert.equal(isAdminLoginConfigured(), false);
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = apiKey;
    delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    assert.equal(isAdminLoginConfigured(), false);
  } finally {
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = apiKey;
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = projectId;
    delete process.env.PORTAL_ADMIN_USERNAME;
    delete process.env.PORTAL_ADMIN_PASSWORD;
  }
});

test("missing configuration cannot create demo or forged sessions", () => {
  const secret = process.env.SESSION_SECRET;
  delete process.env.SESSION_SECRET;
  try {
    assert.equal(isAdminLoginConfigured(), false);
    assert.equal(verifyAdminSessionToken("payload.signature"), null);
    assert.throws(() => createAdminSessionToken(superAdminIdentity), /SESSION_SECRET/);
  } finally {
    process.env.SESSION_SECRET = secret;
  }
});
