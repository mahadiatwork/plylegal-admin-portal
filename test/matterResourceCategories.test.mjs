import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createMatterResourceCategory,
  deleteMatterResourceCategory,
  normalizeMatterResourceCategories,
  renameMatterResourceCategory,
} from "../src/lib/matterResourceCategories.mjs";
import { sortMatterResources } from "../src/lib/matterResources.mjs";

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
          assert.equal(pending.length, 0, "all transaction reads precede writes");
          if (ref.path.endsWith("/resources")) {
            return {
              docs: Object.keys(documents)
                .filter((path) => path.startsWith(`${ref.path}/`))
                .map((path) => snapshot(reference(path))),
            };
          }
          return snapshot(ref);
        },
        update(ref, update) {
          assert.ok(ref.path in documents, "existing documents are updated, not replaced");
          pending.push({ path: ref.path, update });
        },
      });
      if (rejectCommit) throw new Error("Commit rejected");
      for (const { path, update } of pending) documents[path] = { ...documents[path], ...update };
      writes += pending.length;
      return result;
    },
  };
  return { db, documents, get writes() { return writes; } };
}

const defaults = [{ name: "Uncategorized", icon: "folder" }];
const options = { appId: "app", actor: "admin" };

test("matter categories normalize legacy metadata without adding review or archived-only folders", () => {
  assert.deepEqual(normalizeMatterResourceCategories([
    " uncategorized ", { name: " Guides ", icon: "guide" }, "GUIDES",
    { name: "Links", icon: "unknown" }, { name: "", icon: "policy" }, null,
  ], [
    { category: " guides ", status: "active" },
    { category: "Legacy", status: "active" },
    { category: "Review", source: "documentReview", status: "active" },
    { category: "Old", status: "archived" },
    { category: "", status: "active" },
  ]), [
    ...defaults,
    { name: "Guides", icon: "guide" },
    { name: "Links", icon: "folder" },
    { name: "Legacy", icon: "folder" },
  ]);
});

test("creating an empty folder persists its metadata and retains existing matter data and folders", async () => {
  const mock = mockDatabase({
    "applications/app": { reference: "Matter A", client: "client", resourceCategories: ["Guides"] },
    "applications/app/resources/legacy": { type: "link", category: "Legacy", url: "https://example.test" },
    "applications/other": { resourceCategories: ["Elsewhere"] },
  });
  const result = await createMatterResourceCategory({ ...options, db: mock.db, name: " New folder ", icon: "scale" });
  assert.deepEqual(result.categories, [
    ...defaults,
    { name: "Guides", icon: "folder" },
    { name: "Legacy", icon: "folder" },
    { name: "New folder", icon: "scale" },
  ]);
  assert.deepEqual(result.items, []);
  assert.deepEqual(mock.documents["applications/app"].resourceCategories, result.categories);
  assert.equal(mock.documents["applications/app"].reference, "Matter A");
  assert.equal(mock.documents["applications/app"].client, "client");
  assert.equal(mock.documents["applications/app"].updatedBy, "admin");
  assert.ok(mock.documents["applications/app"].updatedAt instanceof Date);
  assert.deepEqual(mock.documents["applications/other"], { resourceCategories: ["Elsewhere"] });
  assert.equal(mock.writes, 1);

  // The folder remains present with no resources after reading stored metadata.
  assert.ok(normalizeMatterResourceCategories(mock.documents["applications/app"].resourceCategories)
    .some((category) => category.name === "New folder"));
});

test("folder creation rejects invalid names, icons and case-insensitive metadata or item conflicts", async () => {
  for (const name of ["", "   ", null]) {
    await assert.rejects(createMatterResourceCategory({ ...options, db: null, name }), { status: 400 });
  }
  await assert.rejects(createMatterResourceCategory({ ...options, db: null, name: "New", icon: "invalid" }), { status: 400 });
  for (const name of ["UNCATEGORIZED", " guides ", "LEGACY", "archived"]) {
    const mock = mockDatabase({
      "applications/app": { resourceCategories: [{ name: "Guides", icon: "guide" }] },
      "applications/app/resources/legacy": { category: "Legacy" },
      "applications/app/resources/archived": { category: "Archived", status: "archived" },
    });
    await assert.rejects(createMatterResourceCategory({ ...options, db: mock.db, name }), { status: 409 });
    assert.equal(mock.writes, 0);
  }
});

test("renaming a folder updates all matching resource kinds and archived rows without affecting other matters or document review", async () => {
  const original = {
    "applications/app": { reference: "Matter", resourceCategories: [{ name: "Guides", icon: "guide" }, { name: "Policies", icon: "shield" }] },
    "applications/app/resources/file": { type: "file", category: "Guides", order: 10, workDriveResourceId: "file", url: "https://example.test/file", fileSize: 20 },
    "applications/app/resources/note": { type: "note", category: " guides ", noteText: "Keep the text", content: "Keep the text" },
    "applications/app/resources/link": { type: "link", category: "GUIDES", externalUrl: "https://example.test/link" },
    "applications/app/resources/archived": { type: "file", category: "Guides", status: "archived" },
    "applications/app/resources/review": { type: "file", category: "Guides", source: "documentReview" },
    "applications/app/resources/archivedReview": { type: "file", category: "Guides", source: "documentReview", status: "archived" },
    "applications/app/resources/other": { type: "note", category: "Policies" },
    "applications/elsewhere": { resourceCategories: ["Guides"] },
    "applications/elsewhere/resources/file": { type: "file", category: "Guides" },
  };
  const mock = mockDatabase(original);
  const result = await renameMatterResourceCategory({ ...options, db: mock.db, name: " guides ", nextName: "Getting started" });
  assert.deepEqual(result.categories, [
    ...defaults, { name: "Getting started", icon: "guide" }, { name: "Policies", icon: "shield" },
  ]);
  assert.deepEqual(result.items, ["file", "note", "link", "archived"].map((id) => ({ id, category: "Getting started" })));
  for (const id of ["file", "note", "link", "archived"]) {
    const { category, updatedAt, updatedBy, ...saved } = mock.documents[`applications/app/resources/${id}`];
    const { category: _originalCategory, ...preserved } = original[`applications/app/resources/${id}`];
    assert.equal(category, "Getting started");
    assert.equal(updatedBy, "admin");
    assert.ok(updatedAt instanceof Date);
    assert.deepEqual(saved, preserved);
  }
  for (const path of ["applications/app/resources/review", "applications/app/resources/archivedReview", "applications/app/resources/other", "applications/elsewhere", "applications/elsewhere/resources/file"]) {
    assert.deepEqual(mock.documents[path], original[path]);
  }
  assert.equal(Object.keys(mock.documents).length, Object.keys(original).length);
});

test("legacy item-only folders support case-only rename and empty persisted folders support rename", async () => {
  const mock = mockDatabase({
    "applications/app": { resourceCategories: [{ name: "Empty", icon: "note" }] },
    "applications/app/resources/legacy": { category: "guides" },
  });
  const renamedLegacy = await renameMatterResourceCategory({ ...options, db: mock.db, name: "guides", nextName: "Guides" });
  assert.ok(renamedLegacy.categories.some((category) => category.name === "Guides"));
  assert.equal(mock.documents["applications/app/resources/legacy"].category, "Guides");
  const renamedEmpty = await renameMatterResourceCategory({ ...options, db: mock.db, name: "Empty", nextName: "Notes" });
  assert.deepEqual(renamedEmpty.items, []);
  assert.ok(renamedEmpty.categories.some((category) => category.name === "Notes" && category.icon === "note"));
});

test("deleting a folder preserves all resources and appends them after ordered and legacy Uncategorized rows", async () => {
  const original = {
    "applications/app": { resourceCategories: [{ name: "Guides", icon: "guide" }, "Policies"] },
    "applications/app/resources/existing": { type: "file", category: "Uncategorized", order: 40 },
    "applications/app/resources/unordered": { type: "link", url: "https://example.test/existing", createdAt: new Date("2026-08-01") },
    "applications/app/resources/second": { type: "file", category: "Guides", order: 20, workDriveResourceId: "file", downloadAllowed: false },
    "applications/app/resources/first": { type: "note", category: " guides ", order: 10, noteText: "Keep note" },
    "applications/app/resources/legacy": { type: "link", category: "GUIDES", url: "https://example.test/guide" },
    "applications/app/resources/archived": { type: "note", category: "Guides", status: "archived", noteText: "Keep archived note" },
    "applications/app/resources/review": { type: "file", category: "Guides", source: "documentReview", order: 999 },
    "applications/app/resources/other": { type: "note", category: "Policies", noteText: "Keep other" },
  };
  const mock = mockDatabase(original);
  const result = await deleteMatterResourceCategory({ ...options, db: mock.db, name: "GUIDES" });
  assert.deepEqual(result.categories, [...defaults, { name: "Policies", icon: "folder" }]);
  assert.deepEqual(result.items.map(({ id, order }) => [id, order]), [
    ["unordered", 50], ["first", 60], ["second", 70], ["archived", 80], ["legacy", 90],
  ]);
  const sorted = sortMatterResources(Object.entries(mock.documents)
    .filter(([path]) => path.startsWith("applications/app/resources/"))
    .map(([path, resource]) => ({ ...resource, id: path.split("/").at(-1) }))
    .filter((resource) => resource.category === "Uncategorized" || !resource.category));
  assert.deepEqual(sorted.map(({ id }) => id), ["existing", "unordered", "first", "second", "archived", "legacy"]);
  assert.equal(mock.documents["applications/app/resources/second"].workDriveResourceId, "file");
  assert.equal(mock.documents["applications/app/resources/second"].downloadAllowed, false);
  assert.equal(mock.documents["applications/app/resources/first"].noteText, "Keep note");
  assert.equal(mock.documents["applications/app/resources/legacy"].url, "https://example.test/guide");
  assert.equal(mock.documents["applications/app/resources/archived"].status, "archived");
  assert.deepEqual(mock.documents["applications/app/resources/review"], original["applications/app/resources/review"]);
  assert.deepEqual(mock.documents["applications/app/resources/other"], original["applications/app/resources/other"]);
  assert.equal(Object.keys(mock.documents).length, Object.keys(original).length);
  const activeRows = Object.entries(mock.documents)
    .filter(([path]) => path.startsWith("applications/app/resources/"))
    .map(([, resource]) => resource);
  assert.ok(!normalizeMatterResourceCategories(mock.documents["applications/app"].resourceCategories, activeRows)
    .some(({ name }) => name === "Guides"));
});

test("deleting an empty persisted folder writes only matter metadata", async () => {
  const mock = mockDatabase({
    "applications/app": { resourceCategories: [{ name: "Empty", icon: "folder" }] },
    "applications/app/resources/legacy": { type: "note", noteText: "Keep unchanged" },
  });
  const result = await deleteMatterResourceCategory({ ...options, db: mock.db, name: "Empty" });
  assert.deepEqual(result.categories, defaults);
  assert.deepEqual(result.items, []);
  assert.deepEqual(mock.documents["applications/app/resources/legacy"], { type: "note", noteText: "Keep unchanged" });
  assert.equal(mock.writes, 1);
});

test("reserved names, missing folders and conflicting metadata or archived items never change resources", async () => {
  for (const [name, nextName] of [["", "New"], ["Guides", ""], ["Uncategorized", "New"], ["Guides", "UNCATEGORIZED"], ["Guides", "Guides"]]) {
    await assert.rejects(renameMatterResourceCategory({ ...options, db: null, name, nextName }), { status: 400 });
  }
  for (const name of ["", " UnCategorized "]) {
    await assert.rejects(deleteMatterResourceCategory({ ...options, db: null, name }), { status: 400 });
  }
  for (const nextName of ["POLICIES", "old"]) {
    const mock = mockDatabase({
      "applications/app": { resourceCategories: ["Guides", "Policies"] },
      "applications/app/resources/old": { category: "Old", status: "archived" },
    });
    await assert.rejects(renameMatterResourceCategory({ ...options, db: mock.db, name: "Guides", nextName }), { status: 409 });
    assert.equal(mock.writes, 0);
  }
  for (const mutate of [renameMatterResourceCategory, deleteMatterResourceCategory]) {
    const mock = mockDatabase({ "applications/app": {} });
    await assert.rejects(mutate({ ...options, db: mock.db, name: "Missing", nextName: "New" }), { status: 404 });
    assert.equal(mock.writes, 0);
  }
});

test("review folders are isolated from creation conflict detection and mutations", async () => {
  const mock = mockDatabase({
    "applications/app": {},
    "applications/app/resources/review": { category: "Review", source: "documentReview" },
  });
  await createMatterResourceCategory({ ...options, db: mock.db, name: "Review" });
  const result = await deleteMatterResourceCategory({ ...options, db: mock.db, name: "Review" });
  assert.deepEqual(result.items, []);
  assert.deepEqual(mock.documents["applications/app/resources/review"], { category: "Review", source: "documentReview" });
});

test("folder mutation transactions reject excessive writes and failed commits atomically", async () => {
  for (const mutate of [renameMatterResourceCategory, deleteMatterResourceCategory]) {
    const original = {
      "applications/app": { resourceCategories: ["Guides"] },
      ...Object.fromEntries(Array.from({ length: 400 }, (_, index) => [
        `applications/app/resources/item${index}`, { type: "file", category: "Guides" },
      ])),
    };
    const mock = mockDatabase(original);
    await assert.rejects(mutate({ ...options, db: mock.db, name: "Guides", nextName: "New" }), { status: 409 });
    assert.equal(mock.writes, 0);
    assert.deepEqual(mock.documents, original);
  }
  const original = {
    "applications/app": { resourceCategories: ["Guides"] },
    "applications/app/resources/file": { type: "file", category: "Guides" },
  };
  for (const mutate of [createMatterResourceCategory, renameMatterResourceCategory, deleteMatterResourceCategory]) {
    const mock = mockDatabase(original, { rejectCommit: true });
    await assert.rejects(mutate({ ...options, db: mock.db, name: mutate === createMatterResourceCategory ? "New" : "Guides", nextName: "New" }), /Commit rejected/);
    assert.equal(mock.writes, 0);
    assert.deepEqual(mock.documents, original);
  }
});

test("missing matter documents abort folder mutations", async () => {
  for (const mutate of [createMatterResourceCategory, renameMatterResourceCategory, deleteMatterResourceCategory]) {
    const mock = mockDatabase({});
    await assert.rejects(mutate({ ...options, db: mock.db, name: "Guides", nextName: "New" }), { status: 404 });
    assert.equal(mock.writes, 0);
  }
});
