import assert from "node:assert/strict";
import test from "node:test";
import {
  reorderMatterResourceFolders,
  reorderResourceTemplateFolders,
} from "../src/lib/resourceFolderOrdering.mjs";

function mockDatabase(initial, { rejectCommit = false } = {}) {
  const documents = structuredClone(initial);
  const writes = [];
  const reference = (path) => ({
    path,
    id: path.split("/").at(-1),
    doc: (id) => reference(`${path}/${id}`),
    collection: (name) => reference(`${path}/${name}`),
  });
  const snapshot = (ref) => ({
    id: ref.id, ref, exists: ref.path in documents, data: () => documents[ref.path],
  });
  const db = {
    collection: reference,
    async runTransaction(callback) {
      const pending = [];
      const result = await callback({
        async get(ref) {
          assert.equal(pending.length, 0, "transaction reads precede writes");
          if (ref.path.endsWith("/resources") || ref.path.endsWith("/items")) {
            return { docs: Object.keys(documents)
              .filter((path) => path.startsWith(`${ref.path}/`))
              .map((path) => snapshot(reference(path))) };
          }
          return snapshot(ref);
        },
        update(ref, value) { pending.push({ path: ref.path, value }); },
      });
      if (rejectCommit) throw new Error("Commit rejected");
      for (const { path, value } of pending) {
        documents[path] = { ...documents[path], ...value };
        writes.push(path);
      }
      return result;
    },
  };
  return { db, documents, writes };
}

test("matter folder order persists, including an empty folder and Uncategorized", async () => {
  const fixture = mockDatabase({
    "applications/app": {
      resourceCategories: [
        { name: "Uncategorized", icon: "folder" },
        { name: "Guides", icon: "guide" },
        { name: "Empty", icon: "scale" },
      ],
    },
    "applications/app/resources/one": { category: "Guides", status: "active" },
    "applications/app/resources/review": { category: "Review", source: "documentReview", status: "active" },
  });
  const result = await reorderMatterResourceFolders({
    db: fixture.db, appId: "app", names: ["Empty", "Guides", "Uncategorized"], actor: "admin",
  });
  assert.deepEqual(result.categories.map((category) => category.name), ["Empty", "Guides", "Uncategorized"]);
  assert.deepEqual(fixture.documents["applications/app"].resourceCategories, result.categories);
  assert.deepEqual(fixture.writes, ["applications/app"]);
  assert.equal(fixture.documents["applications/app/resources/one"].category, "Guides");
});

test("all-visa folder order updates each template atomically without creating other visa folders", async () => {
  const fixture = mockDatabase({
    "resourceTemplates/a": { categories: [
      { name: "Uncategorized", icon: "folder" },
      { name: "Guides", icon: "guide" },
      { name: "Only A", icon: "scale" },
    ] },
    "resourceTemplates/a/items/one": { kind: "file", category: "Guides" },
    "resourceTemplates/b": { categories: [
      { name: "Uncategorized", icon: "folder" },
      { name: "Guides", icon: "guide" },
    ] },
    "resourceTemplates/b/items/two": { kind: "note", category: "Only B" },
  });
  const result = await reorderResourceTemplateFolders({
    db: fixture.db, visaSlugs: ["a", "b"],
    names: ["Only B", "Guides", "Only A", "Uncategorized"],
    actor: "admin", defaultCategories: [],
  });
  assert.deepEqual(result.changes[0].categories.map((category) => category.name),
    ["Guides", "Only A", "Uncategorized"]);
  assert.deepEqual(result.changes[1].categories.map((category) => category.name),
    ["Only B", "Guides", "Uncategorized"]);
  assert.deepEqual(result.changes[0].categories.map((category) => category.order), [20, 30, 40]);
  assert.deepEqual(fixture.writes, ["resourceTemplates/a", "resourceTemplates/b"]);
  assert.equal(fixture.documents["resourceTemplates/a/items/one"].category, "Guides");
});

test("stale, duplicate, and failed folder order writes leave data unchanged", async () => {
  const original = { "applications/app": { resourceCategories: [
    { name: "Uncategorized", icon: "folder" }, { name: "Guides", icon: "guide" },
  ] } };
  const fixture = mockDatabase(original);
  for (const names of [["Guides", "Guides"], ["Guides", "Missing"]]) {
    await assert.rejects(reorderMatterResourceFolders({ db: fixture.db, appId: "app", names, actor: "admin" }));
  }
  assert.deepEqual(fixture.documents, original);
  assert.equal(fixture.writes.length, 0);

  const rejected = mockDatabase(original, { rejectCommit: true });
  await assert.rejects(reorderMatterResourceFolders({
    db: rejected.db, appId: "app", names: ["Guides", "Uncategorized"], actor: "admin",
  }), /Commit rejected/);
  assert.deepEqual(rejected.documents, original);
});

test("template reorder rejects a partial or stale folder list before writing", async () => {
  const original = {
    "resourceTemplates/a": { categories: [
      { name: "Uncategorized", icon: "folder" },
      { name: "Guides", icon: "guide" },
      { name: "Empty", icon: "folder" },
    ] },
  };
  const fixture = mockDatabase(original);
  for (const names of [["Guides", "Uncategorized"], ["Guides", "Uncategorized", "Missing"]]) {
    await assert.rejects(reorderResourceTemplateFolders({
      db: fixture.db, visaSlugs: ["a"], names, actor: "admin", defaultCategories: [],
    }), (error) => error.status === 409);
  }
  assert.equal(fixture.writes.length, 0);
  assert.deepEqual(fixture.documents, original);
});
