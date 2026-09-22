import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@/lib/questionnaireProgress") {
      return {
        url: "data:text/javascript,export const countTrueCompletionKeys = () => 0;",
        shortCircuit: true,
      };
    }
    return next(specifier, context);
  },
});
const { resolveMatterApplication } = await import("../src/lib/matterResolver.js");
hooks.deregister();

function mockDatabase(applications) {
  const queries = [];
  const documents = applications.map(({ id, ...data }) => ({
    id,
    data: () => data,
    ref: {
      collection: () => ({
        doc: () => ({ get: async () => ({ exists: false }) }),
      }),
    },
  }));
  const collection = {
    doc: (id) => ({ get: async () => {
      const document = documents.find((candidate) => candidate.id === id);
      return document ? { ...document, exists: true } : { exists: false };
    } }),
    where: (field, operator, value) => {
      queries.push({ field, operator, value });
      return {
        limit: () => ({ get: async () => {
          const docs = documents.filter((document) => document.data()[field] === value);
          return { empty: docs.length === 0, docs };
        } }),
      };
    },
  };
  return { db: { collection: () => collection }, queries };
}

test("matter lookup accepts the displayed Zoho deal name stored as reference", async () => {
  const { db, queries } = mockDatabase([{ id: "application-1", reference: "Jane Smith - Partner Visa" }]);
  const result = await resolveMatterApplication(db, "Jane Smith - Partner Visa");
  assert.equal(result.appId, "application-1");
  assert.equal(result.matchedBy, "reference");
  assert.ok(queries.some(({ field, value }) => field === "reference" && value === "Jane Smith - Partner Visa"));
});

test("matter lookup retains ID precedence and recognizes a legacy name field", async () => {
  const { db } = mockDatabase([
    { id: "deal-id", reference: "Other matter" },
    { id: "application-2", Deal_Name: "Legacy matter" },
  ]);
  assert.equal((await resolveMatterApplication(db, "deal-id")).matchedBy, "firebaseId");
  const legacy = await resolveMatterApplication(db, "Legacy matter");
  assert.equal(legacy.appId, "application-2");
  assert.equal(legacy.matchedBy, "Deal_Name");
});
