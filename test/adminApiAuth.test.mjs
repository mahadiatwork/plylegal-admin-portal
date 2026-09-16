import assert from "node:assert/strict";
import path from "node:path";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

let session = null;
let accesses;

const dependencies = {
  async getAdminSession() {
    accesses.sessions += 1;
    return session;
  },
  async requireAdminSession() {
    throw new Error("redirect-based authentication must not be used in APIs");
  },
  async resolveMatterApplication() {
    accesses.resolvers += 1;
    return null;
  },
  db: {
    collection() {
      accesses.database += 1;
      throw new Error("unexpected Firestore collection access");
    },
    collectionGroup() {
      accesses.database += 1;
      return { where: () => ({ get: async () => ({ docs: [] }) }) };
    },
  },
  zohoClient: new Proxy({}, {
    get() {
      accesses.zoho += 1;
      throw new Error("unexpected Zoho access");
    },
  }),
};

globalThis.__adminApiAuthDependencies = dependencies;
const mocks = {
  "next/server": "export const NextResponse = Response;",
  "@/lib/adminSession": `
    export const getAdminSession = globalThis.__adminApiAuthDependencies.getAdminSession;
    export const requireAdminSession = globalThis.__adminApiAuthDependencies.requireAdminSession;
  `,
  "@/lib/firebase-admin": "export const db = globalThis.__adminApiAuthDependencies.db; export const initResult = {};",
  "@/lib/matterResolver": "export const resolveMatterApplication = globalThis.__adminApiAuthDependencies.resolveMatterApplication;",
  "@/lib/zohoClient": "export default globalThis.__adminApiAuthDependencies.zohoClient;",
  "@/lib/questionnaireProgress": `
    export const calculateTemporaryWorkProgress = () => ({});
    export const countTrueCompletionKeys = () => 0;
  `,
  "@/lib/routes": "export const getAllRoutes = () => [];",
};

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (mocks[specifier]) {
      return { url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`, shortCircuit: true };
    }
    if (specifier === "@/lib/zohoCorrections") {
      return { url: pathToFileURL(path.resolve("src/lib/zohoCorrections.js")).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const matterRoute = await import("../src/app/api/matter/[matterId]/route.js");
const reviewRoute = await import("../src/app/api/review-comments/[matterId]/route.js");
const commentRoute = await import("../src/app/api/review-comments/[matterId]/[commentId]/route.js");
const documentReviewRoute = await import("../src/app/api/admin/document-review/route.js");
hooks.deregister();
delete globalThis.__adminApiAuthDependencies;

const cases = [
  ["matter GET", matterRoute.GET],
  ["review comments GET", reviewRoute.GET],
  ["review comments POST", reviewRoute.POST],
  ["review comment PATCH", commentRoute.PATCH],
  ["review comment DELETE", commentRoute.DELETE],
  ["document review GET", documentReviewRoute.GET],
];

function resetAccesses() {
  accesses = { sessions: 0, resolvers: 0, database: 0, zoho: 0, body: 0 };
}

for (const [name, handler] of cases) {
  test(`${name} rejects missing admin session before external or body access`, async () => {
    session = null;
    resetAccesses();
    const request = {
      url: "https://portal.test/api/review-comments/matter?source=documentReview",
      async json() {
        accesses.body += 1;
        throw new Error("unauthenticated request body must not be parsed");
      },
    };
    const response = await handler(request, {
      params: Promise.resolve({ matterId: "matter", commentId: "zohoCorrection:correction" }),
    });

    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, "Admin session is required");
    assert.deepEqual(accesses, { sessions: 1, resolvers: 0, database: 0, zoho: 0, body: 0 });
  });
}

test("validated admin sessions continue to existing route behavior", async () => {
  session = { role: "admin" };
  resetAccesses();
  const context = {
    params: Promise.resolve({ matterId: "matter", commentId: "comment" }),
  };
  const request = {
    url: "https://portal.test/api/review-comments/matter",
    async json() {
      accesses.body += 1;
      return { path: "identity", body: "Reviewer note", status: "resolved" };
    },
  };
  const responses = [];
  for (const [, handler] of cases) {
    responses.push(await handler(request, context));
  }

  assert.deepEqual(responses.map((response) => response.status), [404, 404, 404, 404, 404, 200]);
  assert.deepEqual(await responses.at(-1).json(), { success: true, corrections: [] });
  assert.deepEqual(accesses, { sessions: 6, resolvers: 5, database: 1, zoho: 0, body: 2 });
});
