import assert from "node:assert/strict";
import path from "node:path";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const items = new Map();
const writes = [];

function itemSnapshot(id) {
  const data = items.get(id);
  return {
    id,
    exists: Boolean(data),
    data: () => data,
  };
}

const itemsCollection = {
  async add(data) {
    writes.push({ operation: "add", id: "created", data });
    items.set("created", data);
    return { id: "created" };
  },
  doc(id) {
    return {
      id,
      async get() {
        return itemSnapshot(id);
      },
      async update(updates) {
        writes.push({ operation: "update", id, data: updates });
        items.set(id, { ...items.get(id), ...updates });
      },
    };
  },
};

const templateRef = {
  collection(name) {
    assert.equal(name, "items");
    return itemsCollection;
  },
  async update(data) {
    writes.push({ operation: "template-update", data });
  },
};

globalThis.__templateRichTextDependencies = {
  db: {},
  templateRef,
  async getAdminSession() {
    return { role: "admin" };
  },
};

const resourceTemplatesMock = `
  const deps = globalThis.__templateRichTextDependencies;
  export const ensureResourceTemplate = async (_db, visaSlug) => ({
    definition: { visaSlug, workDriveFolderId: "template-folder" },
    ref: deps.templateRef,
    template: { visaSlug },
  });
  export const normalizeResourceUrl = (value) => value || null;
  export const normalizeTemplateItemKind = (value) => String(value || "").trim().toLowerCase() || null;
  export const normalizeTemplateItemStatus = (value, fallback) => String(value || fallback || "").trim().toLowerCase() || null;
  export const normalizeTemplateCategory = (value) => String(value || "Uncategorized").trim() || "Uncategorized";
  export const normalizeTemplateOrder = (value, fallback) => value === null || value === undefined || value === "" ? fallback : Number(value);
  export const normalizeTemplateParentId = () => null;
  export const normalizeVisaSlug = (value) => String(value || "").trim().toLowerCase();
  export const serializeTemplateItemDoc = (doc) => ({ id: doc.id, ...doc.data() });
  export const uploadResourceTemplateFile = async () => ({ data: {} });
  export const validateTemplateParent = async () => ({ valid: true });
  export const deleteResourceTemplateWorkDriveResource = async () => {};
  export const getTemplateItems = async () => [];
  export const wouldCreateFolderCycle = () => false;
`;

const mocks = {
  "next/server": "export const NextResponse = Response;",
  "@/lib/adminSession": "export const getAdminSession = globalThis.__templateRichTextDependencies.getAdminSession;",
  "@/lib/firebase-admin": "export const db = globalThis.__templateRichTextDependencies.db; export const initResult = {};",
  "@/lib/sharedResources": "export const cleanText = (value) => typeof value === 'string' ? value.trim() : '';",
  "@/lib/resourceTemplates": resourceTemplatesMock,
  "@/lib/resourceTemplateDeletion.mjs": "export const deleteResourceTemplateItemSafely = async () => ({});",
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

const collectionRoute = await import("../src/app/api/resource-templates/[visaSlug]/items/route.js");
const itemRoute = await import("../src/app/api/resource-templates/[visaSlug]/items/[itemId]/route.js");
hooks.deregister();
delete globalThis.__templateRichTextDependencies;

const collectionContext = { params: Promise.resolve({ visaSlug: "482" }) };
const itemContext = { params: Promise.resolve({ visaSlug: "482", itemId: "note" }) };

function reset() {
  items.clear();
  writes.length = 0;
}

test("template note create stores sanitized rich HTML and keeps legacy creates plaintext", async () => {
  reset();
  const richForm = new FormData();
  richForm.set("kind", "note");
  richForm.set("name", "Instructions");
  richForm.set(
    "noteHtml",
    '<h1>Instructions</h1><ul><li><i>Read</i> this</li></ul><a href="//unsafe.test">unsafe</a>'
  );

  const richResponse = await collectionRoute.POST(new Request("https://portal.test/api/resource-templates/482/items", {
    method: "POST",
    body: richForm,
  }), collectionContext);
  assert.equal(richResponse.status, 201);
  const rich = items.get("created");
  assert.equal(rich.noteHtml, "<h1>Instructions</h1><ul><li><i>Read</i> this</li></ul>unsafe");
  assert.equal(rich.noteText, "Instructions\nRead this\nunsafe");
  assert.equal(rich.content, rich.noteText);
  assert.equal(rich.contentFormat, "html");

  reset();
  const legacyForm = new FormData();
  legacyForm.set("kind", "note");
  legacyForm.set("name", "Legacy");
  legacyForm.set("content", "<h1>Literal old value</h1>");
  const legacyResponse = await collectionRoute.POST(new Request("https://portal.test/api/resource-templates/482/items", {
    method: "POST",
    body: legacyForm,
  }), collectionContext);
  assert.equal(legacyResponse.status, 201);
  const legacy = items.get("created");
  assert.equal(legacy.noteText, "<h1>Literal old value</h1>");
  assert.equal("noteHtml" in legacy, false);
  assert.equal("contentFormat" in legacy, false);
});

test("template note update sanitizes rich HTML and legacy clients can replace it safely", async () => {
  reset();
  items.set("note", {
    kind: "note",
    name: "Existing",
    noteHtml: "<p>Old</p>",
    noteText: "Old",
    content: "Old",
    contentFormat: "html",
    status: "active",
  });

  const richResponse = await itemRoute.PATCH(new Request("https://portal.test/api/resource-templates/482/items/note", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      noteHtml: '<blockquote>Updated <code>value</code></blockquote><a href="mailto:team@example.test">Email</a>',
    }),
  }), itemContext);
  assert.equal(richResponse.status, 200);
  assert.equal(
    items.get("note").noteHtml,
    '<blockquote>Updated <code>value</code></blockquote><a href="mailto:team@example.test" target="_blank" rel="noopener noreferrer">Email</a>'
  );
  assert.equal(items.get("note").noteText, "Updated value\nEmail");

  const legacyResponse = await itemRoute.PATCH(new Request("https://portal.test/api/resource-templates/482/items/note", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: "<u>Literal replacement</u>" }),
  }), itemContext);
  assert.equal(legacyResponse.status, 200);
  assert.equal(items.get("note").noteText, "<u>Literal replacement</u>");
  assert.equal(items.get("note").content, "<u>Literal replacement</u>");
  assert.equal(items.get("note").noteHtml, null);
  assert.equal(items.get("note").contentFormat, null);
});
