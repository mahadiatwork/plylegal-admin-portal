import assert from "node:assert/strict";
import { createRequire, registerHooks } from "node:module";
import { test } from "node:test";
import { NextRequest } from "next/server.js";
import { createAdminSessionToken } from "../src/lib/adminSessionCore.js";
// The installed Next 16.2 build still exports the legacy utility name.
const require = createRequire(import.meta.url);
const { unstable_doesMiddlewareMatch: doesProxyMatch } = require("next/dist/experimental/testing/server/middleware-testing-utils.js");

process.env.SESSION_SECRET = "proxy-test-secret";
process.env.PORTAL_ADMIN_USERNAME = "proxy-admin";
const hooks = registerHooks({ resolve(specifier, context, next) {
  return next(specifier === "next/server" ? "next/server.js" : specifier, context);
} });
const { proxy, config } = await import("../src/proxy.js");
hooks.deregister();

test("proxy covers dashboard, direct matter links and every admin API, leaving login/assets available", () => {
  for (const url of ["/", "/admin/questionnaires", "/matter/123/resources", "/matter/123/questionnaire-builder", "/api/matter/123", "/api/review-comments/123", "/api/admin/session"]) {
    assert.equal(doesProxyMatch({ config, nextConfig: {}, url }), true, url);
  }
  for (const url of ["/login", "/Ply_Logo_black.png", "/_next/static/chunk.js"]) {
    assert.equal(doesProxyMatch({ config, nextConfig: {}, url }), false, url);
  }
});

test("anonymous and tampered sessions redirect pages to login and return API 401", async () => {
  for (const cookie of ["", "vp_admin_session=forged.signature"]) {
    for (const path of ["/matter/123/resources?scope=all", "/matter/123/questionnaire-builder"]) {
      const page = proxy(new NextRequest(`https://portal.test${path}`, { headers: { cookie } }));
      assert.equal(page.status, 307);
      const redirect = new URL(page.headers.get("location"));
      assert.equal(redirect.pathname, "/login");
      assert.equal(redirect.searchParams.get("next"), path);
    }
    const api = proxy(new NextRequest("https://portal.test/api/resources", { headers: { cookie } }));
    assert.equal(api.status, 401);
    assert.equal((await api.json()).success, false);
  }
});

test("valid login can reach resources and questionnaires, but cross-origin mutations cannot", () => {
  const cookie = `vp_admin_session=${createAdminSessionToken()}`;
  for (const path of ["/", "/admin/questionnaires", "/matter/123/resources", "/matter/123/questionnaire-builder", "/api/resource-templates"]) {
    const response = proxy(new NextRequest(`https://portal.test${path}`, { headers: { cookie } }));
    assert.equal(response.headers.get("x-middleware-next"), "1");
    assert.match(response.headers.get("Cache-Control"), /no-store/);
  }
  assert.equal(proxy(new NextRequest("https://portal.test/api/resources", {
    method: "POST", headers: { cookie, origin: "https://attacker.test" },
  })).status, 403);
});
