import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

let fixture;
globalThis.__questionnaireRouteFixture = () => fixture;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    const mocks = {
      "next/server": "export const NextResponse = Response;",
      "@/lib/adminSession": "export const getAdminSession = async () => globalThis.__questionnaireRouteFixture().session;",
      "@/lib/matterResolver": "export const resolveMatterApplication = async () => globalThis.__questionnaireRouteFixture().resolved;",
      "@/lib/firebase-admin": "export const initResult = {}; export const db = { collection(name) { return globalThis.__questionnaireRouteFixture().collection(name); } };",
    };
    if (mocks[specifier]) return { url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`, shortCircuit: true };
    if (specifier.startsWith("@/lib/")) return { url: pathToFileURL(path.resolve(`src/lib/${specifier.slice(6)}.js`)).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { GET } = await import("../src/app/api/matter/[matterId]/route.js");
hooks.deregister();

function reset(questionnaire) {
  const application = { type: "Employer Nomination Scheme (Subclass 186)", status: "In progress", zohoId: "deal-186" };
  fixture = {
    session: { role: "admin" },
    resolved: { appId: "app-186", appDoc: { id: "app-186", data: () => ({ ...application }) }, matchedBy: "deal" },
    reads: [],
    collection(name) {
      this.reads.push(name);
      if (name === "questionnaireDefinitions") throw new Error("template database unavailable");
      assert.equal(name, "applications");
      return { doc: (id) => {
        assert.equal(id, "app-186");
        return { collection: () => ({ doc: (document) => ({ get: async () => ({ exists: true, data: () => document === "questionnaire" ? questionnaire : {} }) }) }) };
      } };
    },
  };
}

test("resolved deal preserves actual client answers and complete fallback during a template outage", async () => {
  const saved = { visaContext: "186", profiles: [{ id: "person-a", relationship: "main_applicant", given_names: "Alex", family_name: "Doe" }], profiles_data: { "person-a": { details: { given_names: "Alex", family_name: "Doe", has_other_citizenship: false, count: 0 } } } };
  reset(saved);
  const response = await GET({}, { params: Promise.resolve({ matterId: "deal-186" }) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.questionnaire, saved);
  assert.equal(result.application.id, "app-186");
  assert.equal(result.questionnaireDefinition.visaContext, "186");
  assert.ok(result.questionnaireDefinition.pages.length > 10);
  assert.equal(result.questionnaireDefinitionSource, "built-in");
  assert.equal(result.percentage, 0);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("a new matter with no answers still returns full questionnaire structure", async () => {
  reset({});
  const result = await (await GET({}, { params: Promise.resolve({ matterId: "deal-186" }) })).json();
  assert.ok(result.questionnaireDefinition.pages.some((page) => page.route.endsWith("/main-applicant/details")));
  assert.deepEqual(result.questionnaire, {});
  assert.ok(result.progress.totalSections > 0);
});

test("anonymous matter access cannot read either answers or templates", async () => {
  reset({});
  fixture.session = null;
  const response = await GET({}, { params: Promise.resolve({ matterId: "deal-186" }) });
  assert.equal(response.status, 401);
  assert.deepEqual(fixture.reads, []);
});
