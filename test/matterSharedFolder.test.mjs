import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { test } from "node:test";
import { getMatterSharedFolderUrl } from "../src/lib/matterSharedFolder.mjs";

let fixture;
const dependencies = {
  getAdminSession: async () => fixture.session,
  resolveMatterApplication: async () => fixture.application && ({ application: fixture.application }),
  zohoClient: { async getRecord(module, id, fields) {
    fixture.calls.push({ module, id, fields });
    return fixture.deal;
  } },
};
globalThis.__sharedFolderDependencies = dependencies;
const mocks = {
  "next/server": "export const NextResponse = Response;",
  "@/lib/adminSession": "export const getAdminSession = globalThis.__sharedFolderDependencies.getAdminSession;",
  "@/lib/firebase-admin": "export const db = {};",
  "@/lib/matterResolver": "export const resolveMatterApplication = globalThis.__sharedFolderDependencies.resolveMatterApplication;",
  "@/lib/zohoClient": "export default globalThis.__sharedFolderDependencies.zohoClient;",
};
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  if (mocks[specifier]) return { url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`, shortCircuit: true };
  if (specifier.startsWith("@/")) return { url: pathToFileURL(path.resolve("src", specifier.slice(2))).href, shortCircuit: true };
  return nextResolve(specifier, context);
} });
const { GET } = await import("../src/app/api/matter/[matterId]/shared-folder/route.js");
hooks.deregister();
delete globalThis.__sharedFolderDependencies;

const sharedUrl = "https://workdrive.zohopublic.com.au/external/matter-folder";
const request = (id = "app") => GET(new Request("https://admin.test/api/matter/app/shared-folder"), {
  params: Promise.resolve({ matterId: id }),
});
const reset = () => { fixture = { session: { role: "admin" }, application: { zohoId: "123456789" }, deal: { Matter_Workdrive_Folder_URL: sharedUrl }, calls: [] }; };

test("admin folder embeds accept WorkDrive shared and internal URLs only", () => {
  for (const url of [sharedUrl, "https://workdrive.zohoexternal.com.au/file/folder-id", "https://workdrive.zoho.com.au/team/teams/team/ws/workspace/folders/folder-id"]) {
    assert.equal(getMatterSharedFolderUrl(url), url);
  }
  for (const url of [null, "", "javascript:alert(1)", "http://workdrive.zohopublic.com.au/external/token", "https://workdrive.zohopublic.com.au.attacker.test/external/token", "https://user:pass@workdrive.zoho.com.au/file/token", "https://example.test/folder", "https://workdrive.zoho.com.au/"]) {
    assert.equal(getMatterSharedFolderUrl(url), null);
  }
});

test("admin folder route requires a session before fetching Zoho", async () => {
  reset(); fixture.session = null;
  assert.equal((await request()).status, 401);
  assert.equal(fixture.calls.length, 0);
});

test("admin folder route reads the live CRM field including updates and clearing", async () => {
  reset();
  fixture.application.clientSharedFolderUrl = "https://workdrive.zohopublic.com.au/external/stale-folder";
  const response = await request();
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), { success: true, folderUrl: sharedUrl });
  assert.deepEqual(fixture.calls, [{ module: "Deals", id: "123456789", fields: "id,Matter_Workdrive_Folder_URL" }]);
  fixture.deal.Matter_Workdrive_Folder_URL = null;
  assert.deepEqual(await (await request()).json(), { success: true, folderUrl: null });
});

test("admin folder route handles missing matters, invalid IDs, and missing Deal IDs", async () => {
  reset(); assert.equal((await request("../app")).status, 400);
  fixture.application = null; assert.equal((await request()).status, 404);
  fixture.application = {}; assert.deepEqual(await (await request()).json(), { success: true, folderUrl: null });
  assert.equal(fixture.calls.length, 0);
});

test("admin folder route supports legacy Deal ID aliases and rejects unsafe CRM links", async () => {
  for (const field of ["zohoDealId", "dealId"]) {
    reset(); fixture.application = { [field]: "123456789" };
    fixture.deal.Matter_Workdrive_Folder_URL = "https://example.test/unsafe-folder";
    assert.deepEqual(await (await request()).json(), { success: true, folderUrl: null });
    assert.equal(fixture.calls[0].id, "123456789");
  }
});

test("a failed admin CRM lookup reports a retryable error", async () => {
  reset(); fixture.deal = null;
  const response = await request();
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /Please try again/);
});
