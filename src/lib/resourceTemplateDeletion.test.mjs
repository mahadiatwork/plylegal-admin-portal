import assert from "node:assert/strict";
import { test } from "node:test";
import { deleteResourceTemplateItemSafely } from "./resourceTemplateDeletion.mjs";

function fixture({ failStage = false, failFinalize = false } = {}) {
  const events = [];
  let batchNumber = 0;
  const db = {
    batch() {
      batchNumber += 1;
      const currentBatch = batchNumber;
      const operations = [];
      return {
        update(ref, data) { operations.push({ type: "update", ref, data }); },
        delete(ref) { operations.push({ type: "delete", ref }); },
        async commit() {
          events.push({ type: "commit", batch: currentBatch, operations });
          if ((currentBatch === 1 && failStage) || (currentBatch === 2 && failFinalize)) {
            throw new Error(`batch ${currentBatch} failed`);
          }
        },
      };
    },
  };
  return { db, events };
}

const itemRef = { path: "resourceTemplates/482/items/file" };
const templateRef = { path: "resourceTemplates/482" };
const item = { id: "file", kind: "file", status: "active", workDriveResourceId: "workdrive-file" };

test("file deletion hides the item before WorkDrive cleanup and removes it afterward", async () => {
  const { db, events } = fixture();
  const result = await deleteResourceTemplateItemSafely({
    db,
    itemRef,
    templateRef,
    item,
    actor: "admin",
    async deleteExternalResource() {
      assert.equal(events.length, 1);
      assert.equal(events[0].operations[0].data.status, "hidden");
      assert.equal(events[0].operations[0].data.deletionPending, true);
      events.push({ type: "external-delete" });
    },
  });

  assert.deepEqual(result, { deletedId: "file" });
  assert.equal(events[1].type, "external-delete");
  assert.equal(events[2].operations[0].type, "delete");
});

test("failed staging never deletes WorkDrive and failed WorkDrive cleanup remains retryable", async () => {
  let externalCalls = 0;
  const stagedFailure = fixture({ failStage: true });
  await assert.rejects(deleteResourceTemplateItemSafely({
    db: stagedFailure.db,
    itemRef,
    templateRef,
    item,
    actor: "admin",
    async deleteExternalResource() { externalCalls += 1; },
  }), /batch 1 failed/);
  assert.equal(externalCalls, 0);

  const externalFailure = fixture();
  await assert.rejects(deleteResourceTemplateItemSafely({
    db: externalFailure.db,
    itemRef,
    templateRef,
    item,
    actor: "admin",
    async deleteExternalResource() {
      externalCalls += 1;
      throw new Error("provider unavailable");
    },
  }), { status: 502 });
  assert.equal(externalCalls, 1);
  assert.equal(externalFailure.events.length, 1);
  assert.equal(externalFailure.events[0].operations[0].data.deletionPending, true);
});

test("a failed final delete leaves a hidden tombstone that can be retried", async () => {
  const { db, events } = fixture({ failFinalize: true });
  await assert.rejects(deleteResourceTemplateItemSafely({
    db,
    itemRef,
    templateRef,
    item,
    actor: "admin",
    async deleteExternalResource() { events.push({ type: "external-delete" }); },
  }), /batch 2 failed/);

  assert.equal(events[0].operations[0].data.status, "hidden");
  assert.equal(events[1].type, "external-delete");
  assert.equal(events[2].operations[0].type, "delete");
});

test("links and notes are removed in one Firestore batch without external cleanup", async () => {
  const { db, events } = fixture();
  let externalCalls = 0;
  await deleteResourceTemplateItemSafely({
    db,
    itemRef,
    templateRef,
    item: { id: "link", kind: "link" },
    actor: "admin",
    async deleteExternalResource() { externalCalls += 1; },
  });

  assert.equal(externalCalls, 0);
  assert.equal(events.length, 1);
  assert.equal(events[0].operations[0].type, "delete");
});
