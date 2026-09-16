import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import * as sessions from "../src/lib/adminSessionCore.js";
import * as protection from "../src/lib/adminLoginProtection.js";

process.env.SESSION_SECRET = "login-test-secret-not-used-outside-tests";
process.env.PORTAL_ADMIN_USERNAME = "demo.admin";
process.env.PORTAL_ADMIN_PASSWORD = "test-password";
delete process.env.VERCEL;
let token = null;
let cookieOptions;
globalThis.__loginTestSession = {
  ...sessions,
  getAdminSession: async () => sessions.verifyAdminSessionToken(token),
  setAdminSessionCookie: () => {
    token = sessions.createAdminSessionToken();
    cookieOptions = sessions.getAdminSessionCookieOptions();
  },
  clearAdminSessionCookie: () => { token = null; },
};
const mocks = {
  "next/server": "export const NextResponse = Response;",
  "next/headers": "export const cookies = async () => ({});",
  "@/lib/adminLoginProtection": `export { clearLoginAttempts, consumeLoginAttempt, isSameOriginRequest, loginAttemptKey } from ${JSON.stringify(new URL("../src/lib/adminLoginProtection.js", import.meta.url).href)};`,
  "@/lib/adminSession": `const session = globalThis.__loginTestSession;
    export const {clearAdminSessionCookie, getAdminSession, isAdminLoginConfigured, sanitizeNextPath, setAdminSessionCookie, verifyAdminCredentials} = session;`,
};
const hooks = registerHooks({
  resolve(specifier, context, next) {
    return mocks[specifier]
      ? { url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`, shortCircuit: true }
      : next(specifier, context);
  },
});
const route = await import("../src/app/api/admin/session/route.js");
hooks.deregister();
delete globalThis.__loginTestSession;

function request(body, origin = "https://portal.test") {
  return new Request("https://portal.test/api/admin/session", {
    method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body),
  });
}

test("login rejects incomplete, wrong and key-only credentials without creating a cookie", async () => {
  protection.clearLoginAttempts("local");
  for (const body of [
    { key: "test-password" },
    { username: "demo.admin", password: "wrong" },
    { username: "wrong", password: "test-password" },
  ]) {
    const response = await route.POST(request(body));
    assert.ok([400, 401].includes(response.status));
    assert.equal(token, null);
  }
});

test("login sets a signed private cookie, preserves deep links, and logout clears it", async () => {
  const response = await route.POST(request({ username: "demo.admin", password: "test-password", next: "/matter/123/resources" }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).nextPath, "/matter/123/resources");
  assert.equal(cookieOptions.httpOnly, true);
  assert.equal(cookieOptions.maxAge, 43200);
  assert.equal((await route.GET()).status, 200);
  const logout = await route.DELETE(new Request("https://portal.test/api/admin/session", { method: "DELETE" }));
  assert.equal(logout.status, 200);
  assert.equal(token, null);
  assert.equal((await route.GET()).status, 401);
});

test("login/logout reject cross-origin requests even with valid credentials", async () => {
  const login = await route.POST(request({ username: "demo.admin", password: "test-password" }, "https://attacker.test"));
  assert.equal(login.status, 403);
  assert.equal(token, null);
  const logout = await route.DELETE(new Request("https://portal.test/api/admin/session", {
    method: "DELETE", headers: { origin: "https://attacker.test" },
  }));
  assert.equal(logout.status, 403);
  assert.equal(protection.isSameOriginRequest(new Request("http://localhost:3000/api/admin/session", {
    method: "POST", headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
  })), true);
});

test("failed attempts are throttled and expiry allows another attempt", async () => {
  protection.clearLoginAttempts("local");
  for (let i = 0; i < 8; i++) {
    assert.equal((await route.POST(request({ username: "demo.admin", password: "wrong" }))).status, 401);
  }
  const throttled = await route.POST(request({ username: "demo.admin", password: "test-password" }));
  assert.equal(throttled.status, 429);
  assert.ok(Number(throttled.headers.get("Retry-After")) > 0);
  protection.clearLoginAttempts("local");
  for (let i = 0; i < 8; i++) assert.equal(protection.consumeLoginAttempt("expiry-test", 1000), 0);
  assert.ok(protection.consumeLoginAttempt("expiry-test", 1001) > 0);
  assert.equal(protection.consumeLoginAttempt("expiry-test", 901001), 0);
});

test("missing production configuration fails closed without leaking server secrets", async () => {
  const secret = process.env.SESSION_SECRET;
  delete process.env.SESSION_SECRET;
  try {
    const response = await route.POST(request({ username: "demo.admin", password: "test-password" }));
    assert.equal(response.status, 503);
    assert.equal(token, null);
  } finally { process.env.SESSION_SECRET = secret; }
});
