import assert from "node:assert/strict";
import path from "node:path";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

let fixture;

function resourceDocument(resource) {
  return {
    id: resource.id,
    ref: { id: resource.id, path: `applications/app/resources/${resource.id}` },
    data: () => resource,
  };
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
  async runTransaction(callback) {
    const operations = [];
    const result = await callback({
      async get(ref) {
        assert.equal(operations.length, 0, "all reads precede writes");
        assert.equal(ref, resourcesRef);
        return resourcesRef.get();
      },
      update(ref, updates) {
        operations.push({ ref, updates });
      },
    });
    if (fixture.rejectCommit) throw new Error("Commit rejected");
    fixture.resources = fixture.resources.map((resource) => {
      const operation = operations.find(({ ref }) => ref.id === resource.id);
      return operation ? { ...resource, ...operation.updates } : resource;
    });
    fixture.transactionCommits.push(operations);
    return result;
  },
};

const zohoClient = {
  async getRecord(module, id, fields) {
    fixture.dealLookups.push({ module, id, fields });
    return fixture.dealRecord;
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
      application: { id: "app", zohoId: "deal", reference: "Matter", ...fixture.application },
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
    transactionCommits: [],
    uploads: [],
    dealRecord: { Workdrive_Folder_ID: "matter-folder" },
    dealLookups: [],
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

test("matter resource GET defensively sanitizes stored rich notes", async () => {
  resetFixture([{
    id: "note",
    type: "note",
    title: "Stored note",
    noteHtml: '<p>Hello <em>client</em><iframe src="https://unsafe.test"></iframe></p>',
    noteText: "stale",
    content: "stale",
    contentFormat: "html",
    status: "active",
  }]);

  const response = await GET(new Request("https://portal.test/api/matter/app/resources"), context);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.resources[0].noteHtml, "<p>Hello <em>client</em></p>");
  assert.equal(data.resources[0].noteText, "Hello client");
  assert.equal(data.resources[0].content, "Hello client");
});

test("matter resource GET suppresses rich HTML attached to a non-note record", async () => {
  resetFixture([{
    id: "file",
    type: "file",
    title: "Malformed file",
    noteText: "must not render",
    noteHtml: '<img src=x onerror="alert(1)"><script>alert(2)</script>',
    contentFormat: "html",
    status: "active",
  }]);

  const response = await GET(new Request("https://portal.test/api/matter/app/resources"), context);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal("noteHtml" in data.resources[0], false);
  assert.equal("contentFormat" in data.resources[0], false);
  assert.doesNotMatch(JSON.stringify(data.resources[0]), /onerror|<script|alert\(/);
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

test("matter note creation stores sanitized rich HTML and derived plaintext", async () => {
  resetFixture();
  const form = new FormData();
  form.set("type", "note");
  form.set("title", "Next steps");
  form.set(
    "noteHtml",
    '<h2>Next steps</h2><ul><li><strong>Upload</strong> the form</li></ul><a href="javascript:alert(1)">unsafe</a>'
  );

  const response = await POST(new Request("https://portal.test/api/matter/app/resources", {
    method: "POST",
    body: form,
  }), context);

  assert.equal(response.status, 201);
  assert.equal(fixture.adds.length, 1);
  assert.equal(
    fixture.adds[0].noteHtml,
    "<h2>Next steps</h2><ul><li><strong>Upload</strong> the form</li></ul>unsafe"
  );
  assert.equal(fixture.adds[0].noteText, "Next steps\nUpload the form\nunsafe");
  assert.equal(fixture.adds[0].content, fixture.adds[0].noteText);
  assert.equal(fixture.adds[0].description, fixture.adds[0].noteText);
  assert.equal(fixture.adds[0].contentFormat, "html");
});

test("matter note creation keeps legacy note text literal and rejects formatted-empty HTML", async () => {
  resetFixture();
  const legacy = new FormData();
  legacy.set("type", "note");
  legacy.set("noteText", "<strong>Literal legacy text</strong>");

  const legacyResponse = await POST(new Request("https://portal.test/api/matter/app/resources", {
    method: "POST",
    body: legacy,
  }), context);
  assert.equal(legacyResponse.status, 201);
  assert.equal(fixture.adds[0].noteText, "<strong>Literal legacy text</strong>");
  assert.equal("noteHtml" in fixture.adds[0], false);
  assert.equal("contentFormat" in fixture.adds[0], false);

  const empty = new FormData();
  empty.set("type", "note");
  empty.set("noteHtml", "<p><br></p><script>alert(1)</script>");
  const emptyResponse = await POST(new Request("https://portal.test/api/matter/app/resources", {
    method: "POST",
    body: empty,
  }), context);
  assert.equal(emptyResponse.status, 400);
  assert.equal((await emptyResponse.json()).error, "Note text is required");
  assert.equal(fixture.adds.length, 1);
});

test("matter resource GET retains persistent empty folders and infers legacy folders without document review or archived folders", async () => {
  resetFixture([
    { id: "legacy", category: "Legacy", type: "link", status: "active" },
    { id: "guidance", category: " guides ", type: "note", status: "active" },
    { id: "review", category: "Review", type: "file", source: "documentReview", status: "active" },
    { id: "old", category: "Old", type: "file", status: "archived", workDriveCleanupPending: true },
  ]);
  fixture.application = { resourceCategories: [{ name: "Empty", icon: "scale" }, { name: "Guides", icon: "guide" }] };
  const response = await GET(new Request("https://portal.test/api/matter/app/resources"), context);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.categories, [
    { name: "Uncategorized", icon: "folder" },
    { name: "Empty", icon: "scale" },
    { name: "Guides", icon: "guide" },
    { name: "Legacy", icon: "folder" },
  ]);
  assert.ok(result.resources.some(({ id }) => id === "review"), "existing review resource GET contract remains intact");
  assert.ok(result.resources.some(({ id }) => id === "old"), "existing cleanup pending GET contract remains intact");
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

function fileUploadRequest() {
  const form = new FormData();
  form.set("type", "file");
  form.set("file", new File(["matter resource"], "guide.txt", { type: "text/plain" }));
  return new Request("https://portal.test/api/matter/app/resources", {
    method: "POST",
    body: form,
  });
}

test("matter uploads resolve and persist the first usable WorkDrive folder across all Deal fields", async () => {
  const allFields = {
    Workdrive_Folder_ID: "preferred-folder",
    WorkDrive_Folder_ID: "legacy-folder",
    Matter_Folder_ID: "matter-id-folder",
    Matter_Workdrive_Folder_URL: "https://workdrive.zoho.com.au/folder/resource-url-folder?layout=list#view",
    Matter_Folder_URL: "https://workdrive.zoho.com.au/folders/matter-url-folder/?layout=list#view",
  };
  const cases = [
    { record: allFields, expected: "preferred-folder" },
    { record: { ...allFields, Workdrive_Folder_ID: "  " }, expected: "legacy-folder" },
    { record: { ...allFields, Workdrive_Folder_ID: null, WorkDrive_Folder_ID: "" }, expected: "matter-id-folder" },
    { record: { ...allFields, Workdrive_Folder_ID: null, WorkDrive_Folder_ID: "", Matter_Folder_ID: "  " }, expected: "resource-url-folder" },
    { record: { ...allFields, Workdrive_Folder_ID: null, WorkDrive_Folder_ID: "", Matter_Folder_ID: null, Matter_Workdrive_Folder_URL: "" }, expected: "matter-url-folder" },
  ];

  for (const { record, expected } of cases) {
    resetFixture();
    fixture.dealRecord = record;
    const response = await POST(fileUploadRequest(), context);
    assert.equal(response.status, 201, `folder selection should reach ${expected}`);
    assert.deepEqual(fixture.dealLookups, [{
      module: "Deals",
      id: "deal",
      fields: "id,Workdrive_Folder_ID,WorkDrive_Folder_ID,Matter_Folder_ID,Matter_Workdrive_Folder_URL,Matter_Folder_URL",
    }]);
    assert.equal(fixture.uploads[0].folderId, expected);
    assert.equal(fixture.sets[0].data.workDriveFolderId, expected);
    assert.equal((await response.json()).resource.workDriveFolderId, expected);
  }
});

test("matter upload reads the folder ID from the Resource Folder URL shown in Zoho", async () => {
  resetFixture();
  fixture.dealRecord = {
    Matter_Workdrive_Folder_URL: "https://workdrive.zoho.com.au/folder/6qog674368dc67e66435ba71b4e860eeeeb93",
  };
  const response = await POST(fileUploadRequest(), context);
  assert.equal(response.status, 201);
  assert.equal(fixture.uploads[0].folderId, "6qog674368dc67e66435ba71b4e860eeeeb93");
  assert.equal(fixture.sets[0].data.workDriveFolderId, "6qog674368dc67e66435ba71b4e860eeeeb93");
});

test("matter upload resolves workspace folder URLs without using the files placeholder as an ID", async () => {
  for (const url of [
    "https://workdrive.zoho.com.au/team/teams/team/ws/workspace-folder/folders/files?layout=list#view",
    "https://workdrive.zoho.com.au/team/teams/team/ws/workspace-folder/folders/",
  ]) {
    resetFixture();
    fixture.dealRecord = { Matter_Workdrive_Folder_URL: url };
    const response = await POST(fileUploadRequest(), context);
    assert.equal(response.status, 201);
    assert.equal(fixture.uploads[0].folderId, "workspace-folder");
    assert.equal(fixture.sets[0].data.workDriveFolderId, "workspace-folder");
  }
});

test("matter folder fallback accepts existing array and object field wrappers", async () => {
  for (const record of [
    { Workdrive_Folder_ID: [{ id: "wrapped-folder" }] },
    { WorkDrive_Folder_ID: { value: "wrapped-folder" } },
    { Matter_Folder_ID: { name: "wrapped-folder" } },
    { Matter_Workdrive_Folder_URL: [{ value: "https://workdrive.zoho.com.au/folder/wrapped-folder?layout=list" }] },
    { Matter_Folder_URL: { value: "https://workdrive.zoho.com.au/folders/wrapped-folder/#view" } },
  ]) {
    resetFixture();
    fixture.dealRecord = record;
    const response = await POST(fileUploadRequest(), context);
    assert.equal(response.status, 201);
    assert.equal(fixture.uploads[0].folderId, "wrapped-folder");
    assert.equal(fixture.sets[0].data.workDriveFolderId, "wrapped-folder");
  }
});

test("matter uploads skip malformed higher priority folder URLs", async () => {
  for (const record of [
    {
      Workdrive_Folder_ID: "https://workdrive.zoho.com.au/not-a-folder",
      Matter_Folder_ID: "valid-matter-folder",
    },
    {
      Workdrive_Folder_ID: "https://workdrive.zoho.com.au/folder/",
      Matter_Workdrive_Folder_URL: "javascript:alert('folder')",
      Matter_Folder_URL: "https://workdrive.zoho.com.au/folder/valid-matter-folder?layout=list#view",
    },
    {
      Matter_Workdrive_Folder_URL: "https://workdrive.zoho.com.au/folders/files",
      Matter_Folder_URL: "https://workdrive.zoho.com.au/folder/valid-matter-folder",
    },
  ]) {
    resetFixture();
    fixture.dealRecord = record;
    const response = await POST(fileUploadRequest(), context);
    assert.equal(response.status, 201);
    assert.equal(fixture.uploads[0].folderId, "valid-matter-folder");
    assert.equal(fixture.sets[0].data.workDriveFolderId, "valid-matter-folder");
  }
});

test("missing or unusable Deal folder fields reject uploads before WorkDrive or database writes", async () => {
  for (const record of [
    {},
    {
      Workdrive_Folder_ID: " ",
      WorkDrive_Folder_ID: [],
      Matter_Folder_ID: { value: "" },
      Matter_Workdrive_Folder_URL: "https://workdrive.zoho.com.au/not-a-folder",
      Matter_Folder_URL: "not a folder URL",
    },
    null,
  ]) {
    resetFixture();
    fixture.dealRecord = record;
    const response = await POST(fileUploadRequest(), context);
    assert.equal(response.status, record === null ? 502 : 400);
    const result = await response.json();
    assert.equal(result.success, false);
    assert.match(result.error, record === null ? /Unable to fetch the Zoho Deal/ : /no usable WorkDrive folder/i);
    assert.deepEqual(fixture.uploads, []);
    assert.deepEqual(fixture.linkCalls, []);
    assert.deepEqual(fixture.adds, []);
    assert.deepEqual(fixture.sets, []);
    assert.deepEqual(fixture.batchCommits, []);
  }
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
  assert.equal(fixture.uploads[0].folderId, "review-folder");
  assert.deepEqual(fixture.dealLookups, []);
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

function reorderRequest(body) {
  return new Request("https://portal.test/api/matter/app/resources", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("matter drag order persists and survives a fresh resource load", async () => {
  resetFixture([
    { id: "one", category: "Guides", status: "active", order: 10 },
    { id: "two", category: "guides", status: "active", order: 20 },
    { id: "three", category: "Guides", status: "active" },
    { id: "other", category: "Policies", status: "active", order: 40 },
    { id: "review", category: "Guides", source: "documentReview", status: "active", order: 50 },
    { id: "old", category: "Guides", status: "archived", order: 60 },
  ]);
  const unrelated = structuredClone(fixture.resources.slice(3));
  const response = await PATCH(reorderRequest({
    category: "Guides",
    itemIds: ["three", "one", "two"],
  }), context);

  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.items, [
    { id: "three", order: 10 },
    { id: "one", order: 20 },
    { id: "two", order: 30 },
  ]);
  assert.equal(fixture.transactionCommits.length, 1);
  assert.equal(fixture.transactionCommits[0].length, 3);
  assert.deepEqual(fixture.resources.slice(3), unrelated);

  const freshResponse = await GET(new Request("https://portal.test/api/matter/app/resources"), context);
  const fresh = await freshResponse.json();
  assert.deepEqual(
    fresh.resources.filter(({ category, source }) => category?.toLowerCase() === "guides" && source !== "documentReview").map(({ id }) => id),
    ["three", "one", "two"]
  );
});

test("matter drag rejects changed or incomplete folder lists without saving", async () => {
  const resources = [
    { id: "one", category: "Guides", status: "active", order: 10 },
    { id: "two", category: "Guides", status: "active", order: 20 },
    { id: "added", category: "Guides", status: "active", order: 30 },
  ];
  for (const itemIds of [["two", "one"], ["one", "two", "removed"]]) {
    resetFixture(structuredClone(resources));
    const response = await PATCH(reorderRequest({ category: "Guides", itemIds }), context);
    assert.equal(response.status, 409);
    assert.deepEqual(fixture.resources, resources);
    assert.deepEqual(fixture.transactionCommits, []);
  }
});

test("a matter drag commit failure leaves every resource order unchanged", async () => {
  const resources = [
    { id: "one", category: "Guides", status: "active", order: 10 },
    { id: "two", category: "Guides", status: "active", order: 20 },
  ];
  resetFixture(structuredClone(resources));
  fixture.rejectCommit = true;
  const response = await PATCH(reorderRequest({ category: "Guides", itemIds: ["two", "one"] }), context);
  assert.equal(response.status, 500);
  assert.equal((await response.json()).success, false);
  assert.deepEqual(fixture.resources, resources);
  assert.deepEqual(fixture.transactionCommits, []);
});

test("matter drag rejects duplicate IDs and missing folders before reads or saves", async () => {
  for (const body of [
    { itemIds: ["one", "two"] },
    { category: "Guides", itemIds: ["one", "one"] },
  ]) {
    resetFixture();
    const response = await PATCH(reorderRequest(body), context);
    assert.equal(response.status, 400);
    assert.equal(fixture.collectionReads, 0);
    assert.deepEqual(fixture.transactionCommits, []);
  }
});
