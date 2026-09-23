import assert from "node:assert/strict";
import path from "node:path";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const documents = new Map();
const writes = [];

function snapshot(id) {
  const data = documents.get(id);
  return {
    id,
    exists: Boolean(data),
    data: () => data,
  };
}

const resources = {
  orderBy() {
    return {
      async get() {
        return {
          docs: [...documents.entries()].map(([id, data]) => ({
            id,
            data: () => data,
          })),
        };
      },
    };
  },
  async add(data) {
    writes.push({ operation: "add", id: "created", data });
    documents.set("created", data);
    return { id: "created" };
  },
  doc(id) {
    return {
      async get() {
        return snapshot(id);
      },
      async update(updates) {
        writes.push({ operation: "update", id, data: updates });
        documents.set(id, { ...documents.get(id), ...updates });
      },
      async delete() {
        documents.delete(id);
      },
    };
  },
};

globalThis.__sharedRichTextDependencies = {
  db: {
    collection(name) {
      assert.equal(name, "resources");
      return resources;
    },
  },
  async getAdminSession() {
    return { role: "admin" };
  },
};

const mocks = {
  "next/server": "export const NextResponse = Response;",
  "@/lib/adminSession": "export const getAdminSession = globalThis.__sharedRichTextDependencies.getAdminSession;",
  "@/lib/firebase-admin": "export const db = globalThis.__sharedRichTextDependencies.db; export const initResult = {};",
  "@/lib/zohoClient": "export default {};",
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

const collectionRoute = await import("../src/app/api/resources/route.js");
const itemRoute = await import("../src/app/api/resources/[resourceId]/route.js");
hooks.deregister();
delete globalThis.__sharedRichTextDependencies;

function reset() {
  documents.clear();
  writes.length = 0;
}

test("shared note create supports rich HTML without changing legacy note semantics", async () => {
  reset();
  const richForm = new FormData();
  richForm.set("type", "note");
  richForm.set("title", "Rich note");
  richForm.set(
    "noteHtml",
    '<h3 style="text-align:right" onclick="alert(1)">Heading</h3><p><b>Body</b> <a href="https://example.test">link</a></p>'
  );

  const richResponse = await collectionRoute.POST(new Request("https://portal.test/api/resources", {
    method: "POST",
    body: richForm,
  }));
  assert.equal(richResponse.status, 201);
  const rich = documents.get("created");
  assert.equal(
    rich.noteHtml,
    '<h3 style="text-align:right">Heading</h3><p><b>Body</b> <a href="https://example.test" target="_blank" rel="noopener noreferrer">link</a></p>'
  );
  assert.equal(rich.noteText, "Heading\nBody link");
  assert.equal(rich.content, "Heading\nBody link");
  assert.equal(rich.contentFormat, "html");

  reset();
  const legacyForm = new FormData();
  legacyForm.set("type", "note");
  legacyForm.set("noteText", "<em>Literal plaintext</em>");
  const legacyResponse = await collectionRoute.POST(new Request("https://portal.test/api/resources", {
    method: "POST",
    body: legacyForm,
  }));
  assert.equal(legacyResponse.status, 201);
  const legacy = documents.get("created");
  assert.equal(legacy.noteText, "<em>Literal plaintext</em>");
  assert.equal(legacy.content, "<em>Literal plaintext</em>");
  assert.equal("noteHtml" in legacy, false);
  assert.equal("contentFormat" in legacy, false);
});

test("shared note update sanitizes rich HTML and a legacy update safely downgrades it", async () => {
  reset();
  documents.set("note", {
    type: "note",
    title: "Existing",
    noteHtml: "<p>Old rich text</p>",
    noteText: "Old rich text",
    content: "Old rich text",
    contentFormat: "html",
    status: "active",
  });
  const context = { params: Promise.resolve({ resourceId: "note" }) };

  const richResponse = await itemRoute.PATCH(new Request("https://portal.test/api/resources/note", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      noteHtml: '<p>Updated <strong>rich</strong></p><a href="data:text/html,bad">unsafe</a>',
    }),
  }), context);
  assert.equal(richResponse.status, 200);
  assert.equal(documents.get("note").noteHtml, "<p>Updated <strong>rich</strong></p>unsafe");
  assert.equal(documents.get("note").noteText, "Updated rich\nunsafe");
  assert.equal(documents.get("note").contentFormat, "html");

  const legacyResponse = await itemRoute.PATCH(new Request("https://portal.test/api/resources/note", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ noteText: "<b>Literal replacement</b>" }),
  }), context);
  assert.equal(legacyResponse.status, 200);
  assert.equal(documents.get("note").noteText, "<b>Literal replacement</b>");
  assert.equal(documents.get("note").content, "<b>Literal replacement</b>");
  assert.equal(documents.get("note").noteHtml, null);
  assert.equal(documents.get("note").contentFormat, null);
});

test("shared resource GET defensively sanitizes stored rich notes", async () => {
  reset();
  documents.set("note", {
    type: "note",
    title: "Stored note",
    noteHtml: '<p>Hello <strong>client</strong><img src="x" onerror="alert(1)"></p>',
    noteText: "stale",
    content: "stale",
    contentFormat: "html",
    status: "active",
    updatedAt: new Date("2026-09-23T00:00:00Z"),
  });

  const response = await collectionRoute.GET({
    nextUrl: new URL("https://portal.test/api/resources"),
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.resources[0].noteHtml, "<p>Hello <strong>client</strong></p>");
  assert.equal(data.resources[0].noteText, "Hello client");
  assert.equal(data.resources[0].content, "Hello client");
});
