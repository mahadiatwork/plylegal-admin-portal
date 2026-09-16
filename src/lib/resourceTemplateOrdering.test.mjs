import assert from "node:assert/strict";
import test from "node:test";
import { reorderResourceTemplateItems } from "./resourceTemplateOrdering.mjs";

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
    return {
      id: ref.id,
      ref,
      exists: ref.path in documents,
      data: () => documents[ref.path],
    };
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

test("reorders every resource in one visa category with stable gaps", async () => {
  const mock = mockDatabase({
    "resourceTemplates/186": { title: "Subclass 186" },
    "resourceTemplates/186/items/first": { kind: "file", category: "Guides", order: 10 },
    "resourceTemplates/186/items/second": { kind: "link", category: "Guides", order: 20 },
    "resourceTemplates/186/items/third": { kind: "note", category: "Guides", order: 30 },
    "resourceTemplates/186/items/other": { kind: "file", category: "Policies", order: 5 },
    "resourceTemplates/186/items/folder": { kind: "folder", category: "Guides", order: 1 },
  });

  const result = await reorderResourceTemplateItems({
    db: mock.db,
    visaSlug: "186",
    category: "Guides",
    itemIds: ["third", "first", "second"],
    actor: "admin",
  });

  assert.deepEqual(result.items, [
    { id: "third", order: 10 },
    { id: "first", order: 20 },
    { id: "second", order: 30 },
  ]);
  assert.equal(mock.documents["resourceTemplates/186/items/third"].order, 10);
  assert.equal(mock.documents["resourceTemplates/186/items/first"].order, 20);
  assert.equal(mock.documents["resourceTemplates/186/items/second"].order, 30);
  assert.deepEqual(mock.documents["resourceTemplates/186/items/other"], { kind: "file", category: "Policies", order: 5 });
  assert.deepEqual(mock.documents["resourceTemplates/186/items/folder"], { kind: "folder", category: "Guides", order: 1 });
  assert.ok(mock.documents["resourceTemplates/186"].updatedAt instanceof Date);
  assert.equal(mock.writes, 4);
});

test("rejects stale or partial category lists without writing", async () => {
  const original = {
    "resourceTemplates/186": { title: "Subclass 186" },
    "resourceTemplates/186/items/first": { kind: "file", category: "Guides", order: 10 },
    "resourceTemplates/186/items/second": { kind: "file", category: "Guides", order: 20 },
  };
  const mock = mockDatabase(original);

  await assert.rejects(reorderResourceTemplateItems({
    db: mock.db,
    visaSlug: "186",
    category: "Guides",
    itemIds: ["first"],
    actor: "admin",
  }), { status: 409 });

  assert.equal(mock.writes, 0);
  assert.deepEqual(mock.documents, original);
});

test("a failed commit leaves every item order unchanged", async () => {
  const original = {
    "resourceTemplates/186": { title: "Subclass 186" },
    "resourceTemplates/186/items/first": { kind: "file", category: "Guides", order: 10 },
    "resourceTemplates/186/items/second": { kind: "file", category: "Guides", order: 20 },
  };
  const mock = mockDatabase(original, { rejectCommit: true });

  await assert.rejects(reorderResourceTemplateItems({
    db: mock.db,
    visaSlug: "186",
    category: "Guides",
    itemIds: ["second", "first"],
    actor: "admin",
  }), /Commit rejected/);

  assert.equal(mock.writes, 0);
  assert.deepEqual(mock.documents, original);
});

test("pending deletions block folder reorder without writes", async () => {
  const mock = mockDatabase({
    "resourceTemplates/186": { title: "Subclass 186" },
    "resourceTemplates/186/items/one": { kind: "file", category: "Guides", order: 10 },
    "resourceTemplates/186/items/pending": {
      kind: "file",
      category: "Guides",
      order: 20,
      status: "hidden",
      deletionPending: true,
    },
  });

  await assert.rejects(reorderResourceTemplateItems({
    db: mock.db,
    visaSlug: "186",
    category: "Guides",
    itemIds: ["pending", "one"],
    actor: "admin",
  }), { status: 409 });
  assert.equal(mock.writes, 0);
});

test("rejects all-visas, duplicate IDs, and empty categories before database access", async () => {
  for (const options of [
    { visaSlug: "all", category: "Guides", itemIds: ["one"] },
    { visaSlug: "186", category: "Guides", itemIds: ["one", "one"] },
    { visaSlug: "186", category: "", itemIds: ["one"] },
  ]) {
    await assert.rejects(reorderResourceTemplateItems({
      db: null,
      actor: "admin",
      ...options,
    }), { status: 400 });
  }
});
