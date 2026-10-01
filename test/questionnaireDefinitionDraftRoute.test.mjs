import assert from "node:assert/strict";
import path from "node:path";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const definitions = new Map();
const revisions = new Map();
let definitionAudienceQueries = 0;

function clone(value) {
  return structuredClone(value);
}

function snapshot(collectionName, id) {
  const collection = collectionName === "questionnaireDefinitions" ? definitions : revisions;
  const value = collection.get(id);
  return {
    id,
    exists: value !== undefined,
    data: () => value === undefined ? undefined : clone(value),
  };
}

function documentRef(collectionName, id) {
  return { kind: "document", collectionName, id };
}

function queryRef(collectionName, filters = [], limitCount = null) {
  return {
    kind: "query",
    collectionName,
    filters,
    limitCount,
    where(field, operator, value) {
      if (collectionName === "questionnaireDefinitions") definitionAudienceQueries += 1;
      return queryRef(collectionName, [...filters, { field, operator, value }], limitCount);
    },
    limit(value) {
      return queryRef(collectionName, filters, value);
    },
  };
}

function collectionRef(name) {
  const query = queryRef(name);
  return {
    ...query,
    doc(id) {
      return documentRef(name, id);
    },
  };
}

function querySnapshot(query) {
  const collection = query.collectionName === "questionnaireDefinitions" ? definitions : revisions;
  let docs = [...collection].map(([id]) => snapshot(query.collectionName, id));
  for (const { field, operator, value } of query.filters) {
    assert.equal(operator, "==");
    docs = docs.filter((doc) => doc.data()?.[field] === value);
  }
  if (query.limitCount !== null) docs = docs.slice(0, query.limitCount);
  return { docs, empty: docs.length === 0, size: docs.length };
}

const db = {
  collection: collectionRef,
  async runTransaction(callback) {
    return callback({
      async get(target) {
        return target.kind === "query"
          ? querySnapshot(target)
          : snapshot(target.collectionName, target.id);
      },
      set(ref, value, options = {}) {
        const collection = ref.collectionName === "questionnaireDefinitions" ? definitions : revisions;
        const current = collection.get(ref.id) || {};
        collection.set(ref.id, options.merge ? { ...current, ...clone(value) } : clone(value));
      },
      create(ref, value) {
        const collection = ref.collectionName === "questionnaireDefinitions" ? definitions : revisions;
        assert.equal(collection.has(ref.id), false, `${ref.collectionName}/${ref.id} already exists`);
        collection.set(ref.id, clone(value));
      },
    });
  },
};

globalThis.__questionnaireDraftRouteDependencies = {
  db,
  async getAdminSession() {
    return { role: "admin" };
  },
};

const mocks = {
  "next/server": "export const NextResponse = Response;",
  "@/lib/adminSession": "export const getAdminSession = globalThis.__questionnaireDraftRouteDependencies.getAdminSession;",
  "@/lib/adminLoginProtection": "export const isSameOriginRequest = () => true;",
  "@/lib/firebase-admin": "export const db = globalThis.__questionnaireDraftRouteDependencies.db; export const initResult = {};",
  "@/lib/routes": `
    export const getRegisteredQuestionnaireRoutes = () => [{
      href: "/intake/temporary-work/all-applicants/health",
      title: "Health details",
    }];
  `,
  "@/lib/questionnaireLegacyProtection": `
    export const hydrateLegacyQuestionnaireDefinition = (definition) => definition;
    export const getLegacyQuestionnairePublishIssues = () => [];
  `,
};

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (mocks[specifier]) {
      return {
        url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`,
        shortCircuit: true,
      };
    }
    if (specifier.startsWith("@/")) {
      const relativePath = specifier.slice(2);
      const filePath = path.resolve("src", path.extname(relativePath) ? relativePath : `${relativePath}.js`);
      return { url: pathToFileURL(filePath).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { POST } = await import("../src/app/api/questionnaire-definitions/route.js");
hooks.deregister();
delete globalThis.__questionnaireDraftRouteDependencies;

function definition({ id, status, revision }) {
  return {
    id,
    visaType: "temporary-work",
    visaContexts: ["482"],
    title: status === "active" ? "Live questionnaire" : "Live questionnaire — Test",
    version: "1.0.0",
    status,
    schemaVersion: 1,
    revision,
    pages: [
      {
        id: "health",
        route: "/intake/temporary-work/all-applicants/health",
        title: "Health details",
        sectionKey: "health",
        completionKey: "temporary-work/all-applicants/health",
        scope: "shared",
        order: 10,
        questions: [
          {
            id: "health_notes",
            answerKey: "health_notes",
            label: "Health notes",
            type: "textarea",
            required: false,
          },
        ],
      },
    ],
  };
}

test("creating a draft definition preserves draft status and does not replace the live audience", async () => {
  definitions.clear();
  revisions.clear();
  definitionAudienceQueries = 0;

  const live = definition({ id: "live-482", status: "active", revision: 7 });
  live.publishedAt = new Date("2026-09-01T00:00:00.000Z");
  live.publishedBy = "existing-admin";
  definitions.set(live.id, clone(live));
  const liveBefore = clone(definitions.get(live.id));

  const draft = definition({ id: "test-482", status: "draft", revision: 0 });
  const response = await POST(new Request("https://portal.test/api/questionnaire-definitions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  }));

  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.definition.id, draft.id);
  assert.equal(payload.definition.status, "draft");
  assert.equal(payload.definition.revision, 1);
  assert.equal(payload.definition.publishedAt, undefined);
  assert.deepEqual(definitions.get(live.id), liveBefore);
  assert.equal(definitions.get(live.id).status, "active");
  assert.equal(definitions.get(draft.id).status, "draft");
  assert.equal(definitionAudienceQueries, 0, "draft creation should not search for or archive a live conflict");
  assert.ok(revisions.has(`${draft.id}__1`), "the immutable first draft revision should be captured");
});
