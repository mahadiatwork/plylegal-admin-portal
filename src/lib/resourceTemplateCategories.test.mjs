import assert from "node:assert/strict";
import test from "node:test";
import {
  deleteResourceTemplateCategory,
  renameResourceTemplateCategory,
} from "./resourceTemplateCategories.mjs";

function mockDatabase(initialDocuments, { rejectCommit = false } = {}) {
  const documents = structuredClone(initialDocuments);
  let writes = 0;
  function reference(path) {
    return {
      path,
      id: path.split("/").at(-1),
      doc: (id) => reference(`${path}/${id}`),
      collection: (name) => reference(`${path}/${name}`),
    };
  }
  function snapshot(ref) {
    return { id: ref.id, ref, exists: ref.path in documents, data: () => documents[ref.path] };
  }
  const db = {
    collection: reference,
    async runTransaction(callback) {
      const pending = [];
      const result = await callback({
        async get(ref) {
          assert.equal(pending.length, 0, "all reads precede writes");
          if (ref.path.endsWith("/items")) {
            return {
              docs: Object.keys(documents)
                .filter((path) => path.startsWith(`${ref.path}/`))
                .map((path) => snapshot(reference(path))),
            };
          }
          return snapshot(ref);
        },
        update(ref, update) {
          assert.ok(ref.path in documents, "updates preserve existing documents");
          pending.push({ path: ref.path, update });
        },
      });
      if (rejectCommit) throw new Error("Commit rejected");
      for (const { path, update } of pending) {
        documents[path] = { ...documents[path], ...update };
      }
      writes += pending.length;
      return result;
    },
  };
  return { db, documents, get writes() { return writes; } };
}

const template = (categories) => ({ categories, title: "Test visa" });
const file = {
  category: "Guides",
  kind: "file",
  name: "Application guide.docx",
  workDriveResourceId: "existing-file",
  externalUrl: "https://example.com/guide",
  parentId: "folder1",
  status: "hidden",
  size: 2048,
};

test("deleting a category moves every resource kind and preserves file data and other categories", async () => {
  const mock = mockDatabase({
    "resourceTemplates/186": template([{ name: "Uncategorized", icon: "folder" }, { name: "Guides", icon: "guide" }, { name: "Policies", icon: "shield" }]),
    "resourceTemplates/186/items/file1": file,
    "resourceTemplates/186/items/note1": { kind: "note", category: " guides ", noteText: "Keep this note" },
    "resourceTemplates/186/items/link1": { kind: "link", category: "GUIDES", externalUrl: "https://example.com" },
    "resourceTemplates/186/items/folder1": { kind: "folder", category: "Guides", parentId: null },
    "resourceTemplates/186/items/other": { kind: "file", category: "Policies", name: "Keep unchanged" },
  });
  const result = await deleteResourceTemplateCategory({ db: mock.db, visaSlugs: ["186"], name: " Guides ", actor: "admin" });
  assert.equal(result.movedResourceCount, 3);
  assert.deepEqual(result.changes[0].movedItemIds, ["file1", "note1", "link1", "folder1"]);
  assert.deepEqual(mock.documents["resourceTemplates/186"].categories, [{ name: "Uncategorized", icon: "folder" }, { name: "Policies", icon: "shield" }]);
  const { category, order, updatedAt, updatedBy, ...preservedFile } = mock.documents["resourceTemplates/186/items/file1"];
  assert.equal(category, "Uncategorized");
  assert.equal(order, 10);
  assert.equal(updatedBy, "admin");
  assert.ok(updatedAt instanceof Date);
  const { category: _oldCategory, ...expectedFile } = file;
  assert.deepEqual(preservedFile, expectedFile);
  assert.equal(mock.documents["resourceTemplates/186/items/note1"].noteText, "Keep this note");
  assert.equal(mock.documents["resourceTemplates/186/items/folder1"].parentId, null);
  assert.deepEqual(mock.documents["resourceTemplates/186/items/other"], { kind: "file", category: "Policies", name: "Keep unchanged" });
  assert.equal(Object.keys(mock.documents).length, 6);
});

test("All Resources commits across templates and deleting twice stays deleted", async () => {
  const mock = mockDatabase({
    "resourceTemplates/186": template(["Guides"]),
    "resourceTemplates/186/items/file1": file,
    "resourceTemplates/482": template(["Guides", "Policies"]),
    "resourceTemplates/482/items/file2": file,
    "resourceTemplates/partner": template(["Uncategorized"]),
  });
  const options = { db: mock.db, visaSlugs: ["186", "482", "partner"], name: "guides", actor: "admin" };
  const result = await deleteResourceTemplateCategory(options);
  assert.equal(result.changes.length, 2);
  assert.equal(result.movedResourceCount, 2);
  assert.deepEqual(mock.documents["resourceTemplates/186"].categories, [{ name: "Uncategorized", icon: "folder" }]);
  assert.equal(mock.documents["resourceTemplates/482/items/file2"].category, "Uncategorized");
  const writes = mock.writes;
  assert.deepEqual((await deleteResourceTemplateCategory(options)).changes, []);
  assert.equal(mock.writes, writes);
});

test("failed All Resources transaction leaves all categories and resources intact", async () => {
  const original = {
    "resourceTemplates/186": template(["Guides"]),
    "resourceTemplates/186/items/file1": file,
    "resourceTemplates/482": template(["Guides"]),
    "resourceTemplates/482/items/file2": file,
  };
  const mock = mockDatabase(original, { rejectCommit: true });
  await assert.rejects(deleteResourceTemplateCategory({ db: mock.db, visaSlugs: ["186", "482"], name: "Guides", actor: "admin" }), /Commit rejected/);
  assert.deepEqual(mock.documents, original);
  assert.equal(mock.writes, 0);
});

test("a missing visa aborts the complete deletion", async () => {
  const mock = mockDatabase({ "resourceTemplates/186": template(["Guides"]) });
  await assert.rejects(deleteResourceTemplateCategory({ db: mock.db, visaSlugs: ["186", "missing"], name: "Guides", actor: "admin" }), { status: 404 });
  assert.equal(mock.writes, 0);
  assert.deepEqual(mock.documents["resourceTemplates/186"].categories, ["Guides"]);
});

test("Uncategorized and blank category names are rejected before database access", async () => {
  for (const name of ["Uncategorized", " UNCATEGORIZED ", "", null, "   "]) {
    await assert.rejects(deleteResourceTemplateCategory({ db: null, visaSlugs: ["186"], name, actor: "admin" }), { status: 400 });
  }
});

test("legacy item-only categories are removable without resurrecting other categories", async () => {
  const mock = mockDatabase({
    "resourceTemplates/186": template([{ name: "Uncategorized", icon: "folder" }]),
    "resourceTemplates/186/items/file1": { ...file, category: "Custom" },
  });
  await deleteResourceTemplateCategory({ db: mock.db, visaSlugs: ["186"], name: "Custom", actor: "admin" });
  assert.deepEqual(mock.documents["resourceTemplates/186"].categories, [{ name: "Uncategorized", icon: "folder" }]);
  assert.equal(mock.documents["resourceTemplates/186/items/file1"].category, "Uncategorized");
});

test("deleting a category appends moved resources after existing Uncategorized order values", async () => {
  const mock = mockDatabase({
    "resourceTemplates/186": template(["Uncategorized", "Guides"]),
    "resourceTemplates/186/items/existing1": { kind: "file", category: "Uncategorized", order: 10 },
    "resourceTemplates/186/items/existing2": { kind: "note", order: 40 },
    "resourceTemplates/186/items/moved1": { kind: "file", category: "Guides", order: 20 },
    "resourceTemplates/186/items/moved2": { kind: "link", category: "Guides", order: 5 },
    "resourceTemplates/186/items/moved3": { kind: "note", category: "Guides" },
    "resourceTemplates/186/items/folder": { kind: "folder", category: "Guides", order: 999 },
  });

  const result = await deleteResourceTemplateCategory({
    db: mock.db,
    visaSlugs: ["186"],
    name: "Guides",
    actor: "admin",
  });

  assert.equal(mock.documents["resourceTemplates/186/items/moved3"].order, 50);
  assert.equal(mock.documents["resourceTemplates/186/items/moved2"].order, 60);
  assert.equal(mock.documents["resourceTemplates/186/items/moved1"].order, 70);
  assert.equal(mock.documents["resourceTemplates/186/items/folder"].order, 999);
  assert.deepEqual(
    result.changes[0].movedItems,
    [
      { id: "moved1", order: 70 },
      { id: "moved2", order: 60 },
      { id: "moved3", order: 50 },
      { id: "folder" },
    ]
  );
});

test("renaming a category updates metadata and every resource kind without changing resource data", async () => {
  const mock = mockDatabase({
    "resourceTemplates/186": template([{ name: "Uncategorized", icon: "folder" }, { name: "Guides", icon: "guide", colour: "green" }]),
    "resourceTemplates/186/items/file1": file,
    "resourceTemplates/186/items/note1": { kind: "note", category: " guides ", noteText: "Keep this note" },
    "resourceTemplates/186/items/link1": { kind: "link", category: "GUIDES", externalUrl: "https://example.com" },
    "resourceTemplates/186/items/folder1": { kind: "folder", category: "Guides", parentId: null },
  });

  const result = await renameResourceTemplateCategory({
    db: mock.db,
    visaSlugs: ["186"],
    name: "Guides",
    nextName: "Getting started",
    actor: "admin",
  });

  assert.equal(result.renamedResourceCount, 3);
  assert.deepEqual(result.changes[0].renamedItemIds, ["file1", "note1", "link1", "folder1"]);
  assert.deepEqual(mock.documents["resourceTemplates/186"].categories, [
    { name: "Uncategorized", icon: "folder" },
    { name: "Getting started", icon: "guide", colour: "green" },
  ]);
  const { category, updatedAt, updatedBy, ...preservedFile } = mock.documents["resourceTemplates/186/items/file1"];
  assert.equal(category, "Getting started");
  assert.equal(updatedBy, "admin");
  assert.ok(updatedAt instanceof Date);
  const { category: _oldCategory, ...expectedFile } = file;
  assert.deepEqual(preservedFile, expectedFile);
});

test("All Resources category rename commits every affected visa atomically", async () => {
  const mock = mockDatabase({
    "resourceTemplates/186": template(["Guides"]),
    "resourceTemplates/186/items/file1": file,
    "resourceTemplates/482": template([{ name: "Guides", icon: "guide" }]),
    "resourceTemplates/482/items/file2": file,
    "resourceTemplates/partner": template(["Uncategorized"]),
  });

  const result = await renameResourceTemplateCategory({
    db: mock.db,
    visaSlugs: ["186", "482", "partner"],
    name: "Guides",
    nextName: "Visa guides",
    actor: "admin",
  });

  assert.equal(result.changes.length, 2);
  assert.equal(result.renamedResourceCount, 2);
  assert.deepEqual(mock.documents["resourceTemplates/186"].categories, ["Visa guides"]);
  assert.deepEqual(mock.documents["resourceTemplates/482"].categories, [{ name: "Visa guides", icon: "guide" }]);
  assert.equal(mock.documents["resourceTemplates/186/items/file1"].category, "Visa guides");
  assert.equal(mock.documents["resourceTemplates/482/items/file2"].category, "Visa guides");
});

test("renaming a default-backed category preserves sibling default metadata", async () => {
  const defaultCategories = [
    { name: "Uncategorized", icon: "folder" },
    { name: "Guides", icon: "guide" },
    { name: "Policies", icon: "policy" },
  ];
  const mock = mockDatabase({
    "resourceTemplates/186": { title: "Legacy template" },
  });

  await renameResourceTemplateCategory({
    db: mock.db,
    visaSlugs: ["186"],
    name: "Guides",
    nextName: "Getting started",
    actor: "admin",
    defaultCategories,
  });

  assert.deepEqual(mock.documents["resourceTemplates/186"].categories, [
    { name: "Uncategorized", icon: "folder" },
    { name: "Getting started", icon: "guide" },
    { name: "Policies", icon: "policy" },
  ]);
});

test("category mutations reject more than 400 transaction writes before changing data", async () => {
  const items = Object.fromEntries(
    Array.from({ length: 400 }, (_, index) => [
      `resourceTemplates/186/items/item${index}`,
      { kind: "file", category: "Guides", order: index * 10 },
    ])
  );

  for (const mutate of [
    (db) => deleteResourceTemplateCategory({
      db,
      visaSlugs: ["186"],
      name: "Guides",
      actor: "admin",
    }),
    (db) => renameResourceTemplateCategory({
      db,
      visaSlugs: ["186"],
      name: "Guides",
      nextName: "Visa guides",
      actor: "admin",
    }),
  ]) {
    const mock = mockDatabase({
      "resourceTemplates/186": template(["Uncategorized", "Guides"]),
      ...items,
    });

    await assert.rejects(mutate(mock.db), { status: 409 });
    assert.equal(mock.writes, 0);
    assert.deepEqual(mock.documents["resourceTemplates/186"].categories, ["Uncategorized", "Guides"]);
    assert.equal(mock.documents["resourceTemplates/186/items/item0"].category, "Guides");
  }
});

test("a rename collision aborts every selected visa without writes", async () => {
  const original = {
    "resourceTemplates/186": template(["Guides"]),
    "resourceTemplates/186/items/file1": file,
    "resourceTemplates/186/items/policy": { kind: "file", category: "Policies" },
    "resourceTemplates/482": template(["Guides"]),
    "resourceTemplates/482/items/file2": file,
  };
  const mock = mockDatabase(original);

  await assert.rejects(renameResourceTemplateCategory({
    db: mock.db,
    visaSlugs: ["186", "482"],
    name: "Guides",
    nextName: "Policies",
    actor: "admin",
  }), { status: 409 });

  assert.equal(mock.writes, 0);
  assert.deepEqual(mock.documents, original);
});

test("reserved or missing category rename names are rejected before database access", async () => {
  for (const [name, nextName] of [
    ["", "New"],
    ["Guides", ""],
    ["Uncategorized", "New"],
    ["Guides", "Uncategorized"],
    ["Guides", "Guides"],
  ]) {
    await assert.rejects(renameResourceTemplateCategory({
      db: null,
      visaSlugs: ["186"],
      name,
      nextName,
      actor: "admin",
    }), { status: 400 });
  }
});
