import assert from "node:assert/strict";
import path from "node:path";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

let fixture;
function reference(path) {
  return {
    path,
    id: path.split("/").at(-1),
    doc: (id) => reference(`${path}/${id}`),
    collection: (name) => reference(`${path}/${name}`),
  };
}
function snapshot(ref) {
  return { id: ref.id, ref, exists: ref.path in fixture.documents, data: () => fixture.documents[ref.path] };
}
const db = {
  collection(name) {
    fixture.collectionReads += 1;
    assert.equal(name, "applications");
    return reference(name);
  },
  async runTransaction(callback) {
    const writes = [];
    const result = await callback({
      async get(ref) {
        assert.equal(writes.length, 0);
        if (ref.path.endsWith("/resources")) {
          return {
            docs: Object.keys(fixture.documents)
              .filter((path) => path.startsWith(`${ref.path}/`))
              .map((path) => snapshot(reference(path))),
          };
        }
        return snapshot(ref);
      },
      update(ref, data) {
        writes.push({ path: ref.path, data });
      },
    });
    if (fixture.rejectCommit) throw new Error("Commit rejected");
    for (const { path, data } of writes) {
      fixture.documents[path] = { ...fixture.documents[path], ...data };
    }
    fixture.writes.push(...writes);
    return result;
  },
};
const dependencies = {
  db,
  async getAdminSession() {
    return fixture.adminSession;
  },
  async resolveMatterApplication(actualDb, matterId) {
    assert.equal(actualDb, db);
    fixture.resolutions.push(matterId);
    return fixture.missingMatter ? null : { appId: "app", application: fixture.documents["applications/app"] };
  },
};
globalThis.__matterResourceCategoryRouteDependencies = dependencies;
const mocks = {
  "next/server": "export const NextResponse = Response;",
  "@/lib/adminSession": "export const getAdminSession = globalThis.__matterResourceCategoryRouteDependencies.getAdminSession;",
  "@/lib/firebase-admin": "export const db = globalThis.__matterResourceCategoryRouteDependencies.db;",
  "@/lib/matterResolver": "export const resolveMatterApplication = globalThis.__matterResourceCategoryRouteDependencies.resolveMatterApplication;",
};
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (mocks[specifier]) {
      return { url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`, shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
      const relativePath = specifier.slice(2);
      const filePath = path.resolve("src", path.extname(relativePath) ? relativePath : `${relativePath}.js`);
      return { url: pathToFileURL(filePath).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { POST, PATCH, DELETE } = await import("../src/app/api/matter/[matterId]/resources/categories/route.js");
hooks.deregister();
delete globalThis.__matterResourceCategoryRouteDependencies;

function resetFixture(documents = { "applications/app": {} }) {
  fixture = { documents: structuredClone(documents), adminSession: { role: "staff" }, resolutions: [], writes: [], collectionReads: 0 };
}
const context = { params: Promise.resolve({ matterId: "zoho-matter" }) };
const methods = { POST, PATCH, DELETE };
async function invoke(method, body, routeContext = context) {
  return methods[method](new Request("https://portal.test/api/matter/zoho-matter/resources/categories", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }), routeContext);
}

test("every folder mutation requires admin session before resolving or reading matter data", async () => {
  for (const method of Object.keys(methods)) {
    resetFixture();
    fixture.adminSession = null;
    const response = await invoke(method, { name: "Guides", nextName: "New" });
    assert.equal(response.status, 401);
    assert.deepEqual(fixture.resolutions, []);
    assert.equal(fixture.collectionReads, 0);
    assert.deepEqual(fixture.writes, []);
  }
});

test("folder creation resolves Zoho matter ID to application and returns persistent empty folder metadata", async () => {
  resetFixture({
    "applications/app": { reference: "Matter A" },
    "applications/other": { resourceCategories: ["Other"] },
  });
  const response = await invoke("POST", { name: "Guides", icon: "guide" });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.success, true);
  assert.deepEqual(result.categories, [{ name: "Uncategorized", icon: "folder" }, { name: "Guides", icon: "guide" }]);
  assert.deepEqual(result.items, []);
  assert.equal(result.updatedBy, "staff");
  assert.ok(Number.isFinite(Date.parse(result.updatedAt)));
  assert.deepEqual(fixture.resolutions, ["zoho-matter"]);
  assert.deepEqual(fixture.documents["applications/app"].resourceCategories, result.categories);
  assert.equal(fixture.documents["applications/app"].reference, "Matter A");
  assert.deepEqual(fixture.documents["applications/other"], { resourceCategories: ["Other"] });
});

test("folder rename and deletion endpoints return changes and preserve resource URLs, text and document review", async () => {
  const original = {
    "applications/app": { resourceCategories: [{ name: "Guides", icon: "guide" }] },
    "applications/app/resources/link": { type: "link", category: "guides", url: "https://example.test/guide", order: 10 },
    "applications/app/resources/note": { type: "note", category: "GUIDES", noteText: "Keep this", order: 20 },
    "applications/app/resources/review": { type: "file", category: "Guides", source: "documentReview", publicUrl: "https://example.test/review" },
  };
  resetFixture(original);
  const renameResponse = await invoke("PATCH", { name: "Guides", nextName: "Getting started" });
  assert.equal(renameResponse.status, 200);
  const renamed = await renameResponse.json();
  assert.deepEqual(renamed.items, [
    { id: "link", category: "Getting started" }, { id: "note", category: "Getting started" },
  ]);
  assert.ok(renamed.categories.some(({ name, icon }) => name === "Getting started" && icon === "guide"));
  const deleteResponse = await invoke("DELETE", { name: "Getting started" });
  assert.equal(deleteResponse.status, 200);
  const deleted = await deleteResponse.json();
  assert.deepEqual(deleted.categories, [{ name: "Uncategorized", icon: "folder" }]);
  assert.deepEqual(deleted.items, [
    { id: "link", category: "Uncategorized", order: 10 }, { id: "note", category: "Uncategorized", order: 20 },
  ]);
  assert.equal(fixture.documents["applications/app/resources/link"].url, original["applications/app/resources/link"].url);
  assert.equal(fixture.documents["applications/app/resources/note"].noteText, "Keep this");
  assert.deepEqual(fixture.documents["applications/app/resources/review"], original["applications/app/resources/review"]);
});

test("folder endpoints report missing matter and missing matter ID before writes", async () => {
  for (const method of Object.keys(methods)) {
    resetFixture();
    fixture.missingMatter = true;
    assert.equal((await invoke(method, { name: "Guides", nextName: "New" })).status, 404);
    assert.deepEqual(fixture.writes, []);
    resetFixture();
    assert.equal((await invoke(method, { name: "Guides", nextName: "New" }, { params: Promise.resolve({}) })).status, 400);
    assert.deepEqual(fixture.resolutions, []);
    assert.deepEqual(fixture.writes, []);
  }
});

test("folder endpoints reject malformed bodies and duplicate or conflicting names without writes", async () => {
  for (const [method, body, status] of [
    ["POST", null, 400], ["PATCH", null, 400], ["DELETE", null, 400],
    ["POST", { name: " Guides " }, 409],
    ["POST", { name: "New", icon: "bad" }, 400],
    ["PATCH", { name: "Guides", nextName: "POLICIES" }, 409],
    ["PATCH", { name: "Uncategorized", nextName: "New" }, 400],
    ["DELETE", { name: "Uncategorized" }, 400],
  ]) {
    resetFixture({ "applications/app": { resourceCategories: ["Guides", "Policies"] } });
    const response = await invoke(method, body);
    assert.equal(response.status, status);
    assert.equal((await response.json()).success, false);
    assert.deepEqual(fixture.writes, []);
  }
});

test("commit failure surfaces retryable error without reporting success or persisting partial mutation", async () => {
  const original = {
    "applications/app": { resourceCategories: ["Guides"] },
    "applications/app/resources/link": { type: "link", category: "Guides", url: "https://example.test" },
  };
  resetFixture(original);
  fixture.rejectCommit = true;
  const response = await invoke("DELETE", { name: "Guides" });
  assert.equal(response.status, 500);
  assert.equal((await response.json()).success, false);
  assert.deepEqual(fixture.documents, original);
  assert.deepEqual(fixture.writes, []);
});
