import assert from "node:assert/strict";
import path from "node:path";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

let fixture;

function resourceDocument(resource) {
  return { id: resource.id, data: () => resource };
}

const resourcesRef = {
  async get() {
    fixture.collectionReads += 1;
    return { docs: fixture.resources.map(resourceDocument) };
  },
  async add(data) {
    fixture.adds.push(data);
    return { id: "new-link" };
  },
  doc(id = "new-file") {
    return {
      id,
      path: `applications/app/resources/${id}`,
      async set(data) {
        fixture.sets.push({ id, data });
      },
    };
  },
};

const applicationRef = {
  id: "app",
  path: "applications/app",
  collection(name) {
    assert.equal(name, "resources");
    return resourcesRef;
  },
};

const db = {
  collection(name) {
    assert.equal(name, "applications");
    return {
      doc(id) {
        assert.equal(id, "app");
        return applicationRef;
      },
    };
  },
  batch() {
    const operations = [];
    return {
      set(ref, data, options) {
        operations.push({ ref, data, options });
      },
      async commit() {
        fixture.batchCommits.push(operations);
      },
    };
  },
};

const zohoClient = {
  async getRecord() {
    return { Workdrive_Folder_ID: "matter-folder" };
  },
  async findOrCreateWorkDriveFolder() {
    return { resourceId: "review-folder", created: false };
  },
  async uploadWorkDriveFile(folderId, _buffer, name, mimeType) {
    fixture.uploads.push({ folderId, name, mimeType });
    return {
      resourceId: "workdrive-file",
      downloadUrl: "https://files.example.test/raw-download",
      permalink: "https://workdrive.example.test/raw-permalink",
    };
  },
  async createWorkDrivePublicLink(resourceId, name, options) {
    fixture.linkCalls.push({ resourceId, name, options });
    if (options?.allowDownload === false) {
      return {
        link: "https://workdrive.zohopublic.com.au/external/view-only-matter-file",
        linkId: "view-link",
        allowDownload: false,
        downloadUrl: "https://files.example.test/restricted-sentinel",
      };
    }
    return {
      link: "https://workdrive.zohopublic.com.au/external/review-file",
      linkId: "review-link",
      allowDownload: true,
      downloadUrl: "https://files.example.test/review-download",
    };
  },
  async deleteWorkDriveResource(resourceId) {
    fixture.deleted.push(resourceId);
  },
  async updateRecord(module, id, data) {
    fixture.zohoUpdates.push({ module, id, data });
  },
};

const dependencies = {
  db,
  async getAdminSession() {
    return fixture?.adminSession === null
      ? null
      : fixture?.adminSession || { role: "admin" };
  },
  zohoClient,
  async resolveMatterApplication() {
    return {
      appId: "app",
      application: { id: "app", zohoId: "deal", reference: "Matter" },
    };
  },
};

globalThis.__matterResourceRouteDependencies = dependencies;
const mocks = {
  "next/server": "export const NextResponse = Response;",
  "@/lib/adminSession": "export const getAdminSession = globalThis.__matterResourceRouteDependencies.getAdminSession;",
  "@/lib/firebase-admin": "export const db = globalThis.__matterResourceRouteDependencies.db; export const initResult = {};",
  "@/lib/matterResolver": "export const resolveMatterApplication = globalThis.__matterResourceRouteDependencies.resolveMatterApplication;",
  "@/lib/pdfUploadRules.mjs": "export function isPdfUpload() { return true; }",
  "@/lib/zohoClient": "export default globalThis.__matterResourceRouteDependencies.zohoClient;",
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
const { GET, PATCH, POST } = await import("../src/app/api/matter/[matterId]/resources/route.js");
hooks.deregister();
delete globalThis.__matterResourceRouteDependencies;

function resetFixture(resources = []) {
  fixture = {
    resources,
    collectionReads: 0,
    adds: [],
    sets: [],
    batchCommits: [],
    uploads: [],
    linkCalls: [],
    deleted: [],
    zohoUpdates: [],
    adminSession: { role: "admin" },
  };
}

const context = { params: Promise.resolve({ matterId: "app" }) };

test("matter resource reads and writes require an admin session", async () => {
  resetFixture();
  fixture.adminSession = null;

  const getResponse = await GET(
    new Request("https://portal.test/api/matter/app/resources"),
    context
  );
  assert.equal(getResponse.status, 401);

  const form = new FormData();
  form.set("type", "link");
  form.set("url", "https://example.test/guidance");
  const postResponse = await POST(new Request("https://portal.test/api/matter/app/resources", {
    method: "POST",
    body: form,
  }), context);
  assert.equal(postResponse.status, 401);
  const patchResponse = await PATCH(new Request("https://portal.test/api/matter/app/resources", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category: "Guides", itemIds: ["one", "two"] }),
  }), context);
  assert.equal(patchResponse.status, 401);
  assert.equal(fixture.collectionReads, 0);
  assert.deepEqual(fixture.adds, []);
});

test("matter resource list keeps legacy rows and sorts explicit order before creation fallback", async () => {
  resetFixture([
    { id: "legacy-old", title: "Legacy old", status: "active", createdAt: new Date("2026-01-01") },
    { id: "second", title: "Second", status: "active", order: 20, createdAt: new Date("2026-04-01") },
    { id: "archived", title: "Archived", status: "archived", order: 1, createdAt: new Date("2026-05-01") },
    { id: "cleanup", title: "Cleanup pending", status: "archived", workDriveCleanupPending: true, order: 30, createdAt: new Date("2026-05-02") },
    { id: "legacy-new", title: "Legacy new", status: "active", createdAt: new Date("2026-03-01") },
    { id: "first", title: "First", status: "active", order: 10, createdAt: new Date("2026-02-01") },
  ]);

  const response = await GET(new Request("https://portal.test/api/matter/app/resources"), context);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.resources.map((resource) => resource.id), [
    "first", "second", "cleanup", "legacy-new", "legacy-old",
  ]);
  assert.equal(fixture.collectionReads, 1);
});

test("link creation persists category and numeric order without download fields", async () => {
  resetFixture();
  const form = new FormData();
  form.set("type", "link");
  form.set("title", "Official guidance");
  form.set("url", "https://example.test/guidance");
  form.set("category", "Guides");
  form.set("order", "7");

  const response = await POST(new Request("https://portal.test/api/matter/app/resources", {
    method: "POST",
    body: form,
  }), context);
  assert.equal(response.status, 201);
  assert.equal(fixture.adds.length, 1);
  assert.equal(fixture.adds[0].category, "Guides");
  assert.equal(fixture.adds[0].order, 7);
  assert.equal(fixture.adds[0].externalUrl, "https://example.test/guidance");
  assert.equal("downloadUrl" in fixture.adds[0], false);
  assert.equal("downloadAllowed" in fixture.adds[0], false);
});

test("non-review file creation stores only a verified view-only link", async () => {
  resetFixture();
  const form = new FormData();
  form.set("type", "file");
  form.set("title", "Matter guide");
  form.set("category", "Guides");
  form.set("order", "3");
  form.set("file", new File(["document"], "guide.docx"));

  const response = await POST(new Request("https://portal.test/api/matter/app/resources", {
    method: "POST",
    body: form,
  }), context);
  assert.equal(response.status, 201);
  assert.deepEqual(fixture.linkCalls[0].options, { allowDownload: false });
  assert.equal(fixture.sets.length, 1);
  const saved = fixture.sets[0].data;
  assert.equal(saved.category, "Guides");
  assert.equal(saved.order, 3);
  assert.equal(saved.downloadAllowed, false);
  assert.equal(saved.externalUrl, "https://workdrive.zohopublic.com.au/external/view-only-matter-file");
  assert.equal(saved.mimeType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal("downloadUrl" in saved, false);
  assert.equal("workDrivePermalink" in saved, false);
  assert.doesNotMatch(JSON.stringify(saved), /sentinel|raw-download|raw-permalink/);
});

test("document-review upload retains its existing downloadable preview contract", async () => {
  resetFixture();
  const form = new FormData();
  form.set("type", "file");
  form.set("title", "Final review");
  form.set("source", "documentReview");
  form.set("file", new File(["%PDF-1.7"], "review.pdf", { type: "application/pdf" }));

  const response = await POST(new Request("https://portal.test/api/matter/app/resources", {
    method: "POST",
    body: form,
  }), context);
  assert.equal(response.status, 201);
  assert.equal(fixture.linkCalls[0].options, undefined);
  assert.equal(fixture.batchCommits.length, 1);
  const saved = fixture.batchCommits[0].find(({ ref }) => ref.path?.includes("/resources/"))?.data;
  assert.equal(saved.source, "documentReview");
  assert.equal(saved.downloadUrl, "https://files.example.test/review-download");
  assert.equal(saved.workDrivePermalink, "https://workdrive.example.test/raw-permalink");
  assert.equal("downloadAllowed" in saved, false);
  assert.deepEqual(fixture.zohoUpdates[0], {
    module: "Deals",
    id: "deal",
    data: { Final_File_For_Visa_Submission: "https://workdrive.zohopublic.com.au/external/review-file" },
  });
});

test("document-review source cannot be applied to links or notes", async () => {
  for (const type of ["link", "note"]) {
    resetFixture();
    const form = new FormData();
    form.set("type", type);
    form.set("source", "documentReview");
    form.set("url", "https://example.test/guidance");
    form.set("description", "A forged document-review resource");

    const response = await POST(new Request("https://portal.test/api/matter/app/resources", {
      method: "POST",
      body: form,
    }), context);

    assert.equal(response.status, 400);
    assert.deepEqual(fixture.adds, []);
    assert.deepEqual(fixture.sets, []);
  }
});

test("invalid matter resource order is rejected before any write", async () => {
  resetFixture();
  const form = new FormData();
  form.set("type", "link");
  form.set("url", "https://example.test/guidance");
  form.set("order", "first");

  const response = await POST(new Request("https://portal.test/api/matter/app/resources", {
    method: "POST",
    body: form,
  }), context);
  assert.equal(response.status, 400);
  assert.deepEqual(fixture.adds, []);
  assert.deepEqual(fixture.sets, []);
});
