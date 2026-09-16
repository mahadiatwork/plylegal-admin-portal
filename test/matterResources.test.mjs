import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createViewOnlyMatterResourceLink,
  normalizeMatterResourceOrder,
  reorderMatterResources,
  sortMatterResources,
} from "../src/lib/matterResources.mjs";

const viewerUrl = "https://workdrive.zohopublic.com.au/external/matter-resource";

test("matter resource order accepts finite values and distinguishes omitted values", () => {
  assert.equal(normalizeMatterResourceOrder("1"), 1);
  assert.equal(normalizeMatterResourceOrder("12"), 12);
  assert.equal(normalizeMatterResourceOrder(2.5), 2.5);
  assert.equal(normalizeMatterResourceOrder(""), undefined);
  assert.equal(normalizeMatterResourceOrder("   "), undefined);
  assert.equal(normalizeMatterResourceOrder(null, null), null);
  assert.equal(normalizeMatterResourceOrder("first"), null);
  for (const value of [true, false, [], [1], {}, Infinity, NaN]) {
    assert.equal(normalizeMatterResourceOrder(value), null);
  }
});

test("order one puts a resource ahead of existing ordered and unranked resources", () => {
  const resources = sortMatterResources([
    { id: "legacy", createdAt: "2026-09-16" },
    { id: "existing", order: 10, createdAt: "2026-09-16" },
    { id: "selected", order: "1", createdAt: "2026-01-01" },
  ]);
  assert.deepEqual(resources.map(({ id }) => id), ["selected", "existing", "legacy"]);
});

test("matter resources sort by explicit order then newest creation fallback", () => {
  const resources = sortMatterResources([
    { id: "legacy-old", title: "Legacy old", createdAt: "2026-01-01T00:00:00Z" },
    { id: "second", title: "Second", order: 20, createdAt: "2026-04-01T00:00:00Z" },
    { id: "legacy-new", title: "Legacy new", createdAt: "2026-03-01T00:00:00Z" },
    { id: "first-new", title: "First new", order: 10, createdAt: "2026-02-01T00:00:00Z" },
    { id: "first-old", title: "First old", order: 10, createdAt: "2026-01-01T00:00:00Z" },
  ]);

  assert.deepEqual(
    resources.map((resource) => resource.id),
    ["first-new", "first-old", "second", "legacy-new", "legacy-old"]
  );
});

function mockMatterDatabase(resources) {
  const writes = [];
  const docs = resources.map((resource) => ({
    id: resource.id,
    ref: { path: `applications/app/resources/${resource.id}` },
    data: () => resource,
  }));
  const resourcesRef = { path: "applications/app/resources" };
  const db = {
    collection(name) {
      assert.equal(name, "applications");
      return {
        doc(appId) {
          assert.equal(appId, "app");
          return {
            collection(collectionName) {
              assert.equal(collectionName, "resources");
              return resourcesRef;
            },
          };
        },
      };
    },
    async runTransaction(callback) {
      return callback({
        async get(ref) {
          assert.equal(ref, resourcesRef);
          return { docs };
        },
        update(ref, data) {
          writes.push({ ref, data });
        },
      });
    },
  };
  return { db, writes };
}

test("matter resources reorder atomically within one complete folder", async () => {
  const mock = mockMatterDatabase([
    { id: "one", status: "active", category: "Guides" },
    { id: "two", status: "active", category: "guides" },
    { id: "other", status: "active", category: "Links" },
    { id: "review", status: "active", source: "documentReview", category: "Guides" },
  ]);

  const result = await reorderMatterResources({
    db: mock.db,
    appId: "app",
    category: "Guides",
    itemIds: ["two", "one"],
    actor: "admin",
  });

  assert.deepEqual(result.items, [{ id: "two", order: 10 }, { id: "one", order: 20 }]);
  assert.deepEqual(mock.writes.map(({ ref, data }) => [ref.path, data.order]), [
    ["applications/app/resources/two", 10],
    ["applications/app/resources/one", 20],
  ]);
  assert.ok(mock.writes.every(({ data }) => data.updatedBy === "admin" && data.updatedAt instanceof Date));
});

test("matter reorder requires an explicit folder before accessing the database", async () => {
  for (const category of [undefined, null, "", "   ", 1]) {
    await assert.rejects(reorderMatterResources({
      db: null,
      appId: "app",
      category,
      itemIds: ["one", "two"],
      actor: "admin",
    }), { status: 400 });
  }
});

test("Uncategorized reorder includes legacy categories and excludes archived resources", async () => {
  const mock = mockMatterDatabase([
    { id: "legacy", status: "active" },
    { id: "blank", category: "  ", status: "active" },
    { id: "named", category: "uncategorized", status: "active" },
    { id: "archived", category: "Uncategorized", status: "archived" },
    { id: "review", source: "documentReview", status: "active" },
  ]);
  const result = await reorderMatterResources({
    db: mock.db,
    appId: "app",
    category: "Uncategorized",
    itemIds: ["named", "legacy", "blank"],
    actor: "admin",
  });
  assert.deepEqual(result.items, [
    { id: "named", order: 10 },
    { id: "legacy", order: 20 },
    { id: "blank", order: 30 },
  ]);
  assert.equal(mock.writes.length, 3);
});

test("matter resource reorder rejects stale, partial, or duplicate lists without writes", async () => {
  for (const itemIds of [["one", "missing"], ["one", "one"], ["one"]]) {
    const mock = mockMatterDatabase([
      { id: "one", status: "active", category: "Guides" },
      { id: "two", status: "active", category: "Guides" },
    ]);
    await assert.rejects(reorderMatterResources({
      db: mock.db,
      appId: "app",
      category: "Guides",
      itemIds,
      actor: "admin",
    }));
    assert.deepEqual(mock.writes, []);
  }
});

test("matter resource sharing requests and verifies a download-disabled viewer", async () => {
  const calls = [];
  const zohoClient = {
    async createWorkDrivePublicLink(resourceId, name, options) {
      calls.push({ resourceId, name, options });
      return { link: viewerUrl, linkId: "link", allowDownload: false };
    },
    async deleteWorkDriveResource() {
      assert.fail("verified viewers must not be deleted");
    },
  };

  const result = await createViewOnlyMatterResourceLink({
    zohoClient,
    workDriveResourceId: "file",
    linkName: "Guide",
  });

  assert.equal(result.viewerUrl, viewerUrl);
  assert.deepEqual(calls, [{
    resourceId: "file",
    name: "Guide",
    options: { allowDownload: false },
  }]);
});

test("unverified matter resource sharing fails closed and removes the upload", async () => {
  const deleted = [];
  const zohoClient = {
    async createWorkDrivePublicLink() {
      return { link: viewerUrl, allowDownload: true };
    },
    async deleteWorkDriveResource(resourceId) {
      deleted.push(resourceId);
    },
  };

  await assert.rejects(
    createViewOnlyMatterResourceLink({
      zohoClient,
      workDriveResourceId: "file",
      linkName: "Guide",
    }),
    /view-only/
  );
  assert.deepEqual(deleted, ["file"]);
});
