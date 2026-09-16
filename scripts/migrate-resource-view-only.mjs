import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { planResourceViewOnly, protectedResourceData } from "./resource-view-only-plan.mjs";

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Usage: node scripts/migrate-resource-view-only.mjs [--dry-run | --apply]");
  console.log("Default: read-only Firestore inventory. --apply restricts existing WorkDrive links and updates Resource Center records.");
  process.exit(0);
}
if (args.some((arg) => !["--apply", "--dry-run"].includes(arg)) ||
    (args.includes("--apply") && args.includes("--dry-run"))) {
  console.error("Use --dry-run (default) or --apply, without additional arguments.");
  process.exit(1);
}
const apply = args.includes("--apply");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (path.resolve(process.cwd()) !== projectRoot) {
  console.error("Run this migration from the admin portal project root so credential-file resolution matches the application.");
  process.exit(1);
}

// The existing provider/credential helpers log response bodies. Keep those logs,
// URLs and tokens out of operator output; all migration operations are sequential.
async function quiet(operation) {
  const methods = ["log", "info", "debug", "warn", "error"];
  const originals = methods.map((method) => console[method]);
  methods.forEach((method) => { console[method] = () => {}; });
  try {
    return await operation();
  } finally {
    methods.forEach((method, index) => { console[method] = originals[index]; });
  }
}

function errorCode(error) {
  const code = error?.response?.status || error?.status || error?.code;
  return Number.isInteger(code) ? `code_${code}` : "request_failed";
}

async function* resourceDocuments(db) {
  // Do not use collectionGroup('resources'): inventory only the three Resource
  // Centre locations and explicitly exclude document-review PDFs.
  const templates = await db.collection("resourceTemplates").listDocuments();
  for (const template of templates) {
    const items = await template.collection("items").where("kind", "==", "file").get();
    for (const snapshot of items.docs) yield { snapshot, kind: "template" };
  }
  const shared = await db.collection("resources").where("type", "==", "file").get();
  for (const snapshot of shared.docs) yield { snapshot, kind: "shared" };
  const applications = await db.collection("applications").listDocuments();
  for (const application of applications) {
    const matterResources = await application.collection("resources").get();
    for (const snapshot of matterResources.docs) {
      const data = snapshot.data() || {};
      const type = String(data.type || data.kind || "").trim().toLowerCase();
      const source = String(data.source || "").trim().toLowerCase();
      if (type === "file" && source !== "documentreview") {
        yield { snapshot, kind: "matter" };
      }
    }
  }
}

async function main() {
  // Resolve Next's dependency from Next itself, including strict pnpm installs.
  const require = createRequire(import.meta.url);
  const requireFromNext = createRequire(require.resolve("next/package.json"));
  const { loadEnvConfig } = requireFromNext("@next/env");
  await quiet(() => loadEnvConfig(projectRoot));
  const { db, default: admin } = await quiet(() => import("../src/lib/firebase-admin.js"));
  if (!db) throw new Error("Firebase initialization failed");
  const zohoClient = apply
    ? (await quiet(() => import("../src/lib/zohoClient.js"))).default
    : null;
  const summary = { scanned: 0, ready: 0, blocked: 0, updated: 0, unchanged: 0, failed: 0 };
  console.log(`Resource Center view-only migration: ${apply ? "APPLY" : "DRY RUN (no writes)"}`);

  for await (const { snapshot, kind } of resourceDocuments(db)) {
    summary.scanned += 1;
    const original = snapshot.data();
    const plan = planResourceViewOnly(original, kind);
    if (plan.problems.length) {
      summary.blocked += 1;
      console.log(`BLOCKED ${snapshot.ref.path}: ${plan.problems.join(", ")}`);
      continue;
    }
    summary.ready += 1;
    if (!apply) {
      console.log(`READY ${snapshot.ref.path}: restrict ${plan.linkIds.length} existing link(s), replace/remove ${plan.removedFields.length} URL/raw field(s)`);
      continue;
    }

    try {
      const current = await snapshot.ref.get();
      if (!current.exists || !current.updateTime.isEqual(snapshot.updateTime)) {
        summary.failed += 1;
        console.log(`RETRY ${snapshot.ref.path}: record changed since inventory`);
        continue;
      }
      const verifiedLinks = new Map();
      for (const linkId of plan.linkIds) {
        const result = await quiet(() => zohoClient.updateWorkDriveLinkDownload(linkId, false));
        verifiedLinks.set(linkId, result);
      }
      const next = protectedResourceData(plan, verifiedLinks);
      const patch = {};
      for (const key of new Set([...Object.keys(original), ...Object.keys(next)])) {
        if (!Object.hasOwn(next, key)) patch[key] = admin.firestore.FieldValue.delete();
        else if (!isDeepStrictEqual(original[key], next[key])) patch[key] = next[key];
      }
      if (!Object.keys(patch).length) {
        summary.unchanged += 1;
        console.log(`VERIFIED ${snapshot.ref.path}: links restricted; record already current`);
        continue;
      }
      patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      patch.updatedBy = "resource-view-only-migration";
      const fields = Object.entries(patch).flatMap(([key, value]) => [
        new admin.firestore.FieldPath(key), value,
      ]);
      await snapshot.ref.update(...fields, { lastUpdateTime: snapshot.updateTime });
      summary.updated += 1;
      console.log(`UPDATED ${snapshot.ref.path}: existing links restricted and URL aliases cleaned`);
    } catch (error) {
      summary.failed += 1;
      console.log(`FAILED ${snapshot.ref.path}: ${errorCode(error)}; record not marked protected, rerun after resolving the provider error or concurrent edit`);
    }
  }
  console.log(JSON.stringify(summary));
  if (summary.blocked || summary.failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Migration stopped (${errorCode(error)}). Check Firebase/WorkDrive configuration and access; detailed provider output is suppressed.`);
  process.exitCode = 1;
});
