import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

let databaseAccesses = 0;
const dependencies = {
  async getAdminSession() {
    return null;
  },
  db: {
    collection() {
      databaseAccesses += 1;
      throw new Error("unauthenticated requests must not access Firestore");
    },
  },
};

globalThis.__sharedResourceAuthDependencies = dependencies;
const mocks = {
  "next/server": "export const NextResponse = Response;",
  "@/lib/adminSession": "export const getAdminSession = globalThis.__sharedResourceAuthDependencies.getAdminSession;",
  "@/lib/firebase-admin": "export const db = globalThis.__sharedResourceAuthDependencies.db; export const initResult = {};",
  "@/lib/sharedResources": `
    export const MAX_SHARED_RESOURCE_FILE_SIZE = 52428800;
    export const cleanText = (value) => typeof value === "string" ? value.trim() : "";
    export const normalizeCategory = (value) => value || "General";
    export const normalizeResourceScope = (value, fallback) => value || fallback;
    export const normalizeResourceStatus = (value, fallback) => value || fallback;
    export const normalizeResourceType = (value) => value || null;
    export const normalizeResourceUrl = (value) => value || null;
    export const serializeResourceDoc = () => ({});
    export const uploadSharedResourceFile = async () => ({});
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
    return nextResolve(specifier, context);
  },
});

const collectionRoute = await import("../src/app/api/resources/route.js");
const itemRoute = await import("../src/app/api/resources/[resourceId]/route.js");
hooks.deregister();
delete globalThis.__sharedResourceAuthDependencies;

test("shared Resource Centre APIs reject unauthenticated reads and writes before Firestore", async () => {
  databaseAccesses = 0;
  const collectionRequest = new Request("https://portal.test/api/resources");
  const itemContext = { params: Promise.resolve({ resourceId: "resource" }) };

  const responses = [
    await collectionRoute.GET(collectionRequest),
    await collectionRoute.POST(new Request("https://portal.test/api/resources", {
      method: "POST",
      body: new FormData(),
    })),
    await itemRoute.PATCH(new Request("https://portal.test/api/resources/resource", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Changed" }),
    }), itemContext),
    await itemRoute.DELETE(
      new Request("https://portal.test/api/resources/resource", { method: "DELETE" }),
      itemContext
    ),
  ];

  assert.deepEqual(responses.map((response) => response.status), [401, 401, 401, 401]);
  for (const response of responses) {
    assert.equal((await response.json()).error, "Admin session is required");
  }
  assert.equal(databaseAccesses, 0);
});
