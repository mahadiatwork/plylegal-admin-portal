const fs = require("node:fs");
const path = require("node:path");
const admin = require("firebase-admin");

const dryRun = process.argv.includes("--dry-run");
const includeArchived = process.argv.includes("--include-archived");

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCategory(value) {
  return cleanText(value) || "General";
}

function normalizeStatus(value) {
  const normalized = cleanText(value).toLowerCase();

  if (normalized === "archived") return "archived";
  if (normalized === "inactive") return "inactive";
  if (normalized === "draft") return "draft";
  return "active";
}

function normalizeScope(value) {
  const normalized = cleanText(value).toLowerCase();

  if (normalized === "group" || normalized === "application") {
    return normalized;
  }

  return "shared";
}

function normalizeDate(value, fallback = new Date()) {
  if (!value) return fallback;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, "utf8");

  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) {
      continue;
    }

    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    if (process.env[key]) {
      continue;
    }

    let value = rawValue.trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value.replace(/\\n/g, "\n");
  }
}

function loadServiceAccountFromFile(projectRoot) {
  const candidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    path.join(projectRoot, "service.json"),
    path.join(projectRoot, "service-account.json"),
  ].filter(Boolean);

  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) {
        continue;
      }

      const raw = fs.readFileSync(filePath, "utf8");
      return JSON.parse(raw);
    } catch (error) {
      console.warn(`Skipping unreadable service account file ${filePath}: ${error.message}`);
    }
  }

  return null;
}

function loadServiceAccount(projectRoot) {
  const base64Key = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (base64Key) {
    try {
      return JSON.parse(Buffer.from(base64Key, "base64").toString("utf8"));
    } catch (_error) {}
  }

  const inlineKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (inlineKey) {
    try {
      let normalized = inlineKey.trim();

      if (
        (normalized.startsWith('"') && normalized.endsWith('"')) ||
        (normalized.startsWith("'") && normalized.endsWith("'"))
      ) {
        normalized = normalized.slice(1, -1);
      }

      if (normalized.includes('\\"')) {
        normalized = normalized.replace(/\\"/g, '"');
      }

      return JSON.parse(normalized);
    } catch (_error) {}
  }

  return loadServiceAccountFromFile(projectRoot);
}

function initializeFirebase(projectRoot) {
  parseEnvFile(path.join(projectRoot, ".env"));
  parseEnvFile(path.join(projectRoot, ".env.local"));

  const serviceAccount = loadServiceAccount(projectRoot);
  if (!serviceAccount) {
    throw new Error(
      "Firebase service account credentials are required. Provide FIREBASE_SERVICE_ACCOUNT_KEY or service.json."
    );
  }

  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n").trim();
  }

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId:
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
      process.env.FIREBASE_PROJECT_ID ||
      serviceAccount.project_id,
  });
}

function mapLegacyResource(resource, context) {
  const now = new Date();
  const createdAt = normalizeDate(resource.createdAt, now);
  const updatedAt = normalizeDate(resource.updatedAt, createdAt);
  const status = normalizeStatus(resource.status);
  const noteText = cleanText(resource.noteText || resource.content);

  const mapped = {
    title: cleanText(resource.title) || cleanText(resource.fileName) || "Untitled resource",
    description: cleanText(resource.description),
    noteText: noteText || null,
    content: noteText || null,
    url: cleanText(resource.url || resource.publicUrl),
    publicUrl: cleanText(resource.publicUrl || resource.url),
    type: cleanText(resource.type).toLowerCase() || "file",
    category: normalizeCategory(resource.category),
    status,
    scope: normalizeScope(resource.scope),
    audience: cleanText(resource.audience),
    program: cleanText(resource.program),
    createdAt,
    updatedAt,
    createdBy: cleanText(resource.createdBy) || "migration",
    updatedBy: cleanText(resource.updatedBy) || cleanText(resource.createdBy) || "migration",
    migratedAt: now,
    migration: {
      source: "legacy-application-resource",
      legacyAppId: context.appId,
      legacyResourceId: context.resourceId,
      legacyResourcePath: context.legacyPath,
      legacyMatterId: context.matterId,
      legacyMatterReference: context.reference,
    },
  };

  if (resource.fileName) mapped.fileName = resource.fileName;
  if (resource.fileSize) mapped.fileSize = resource.fileSize;
  if (resource.mimeType) mapped.mimeType = resource.mimeType;
  if (resource.downloadUrl) mapped.downloadUrl = resource.downloadUrl;
  if (resource.workDriveFolderId) mapped.workDriveFolderId = resource.workDriveFolderId;
  if (resource.workDriveResourceId) mapped.workDriveResourceId = resource.workDriveResourceId;
  if (resource.workDrivePublicLinkId) mapped.workDrivePublicLinkId = resource.workDrivePublicLinkId;
  if (resource.workDrivePermalink) mapped.workDrivePermalink = resource.workDrivePermalink;

  if (status === "active") {
    mapped.publishedAt = createdAt;
    mapped.publishedBy = cleanText(resource.createdBy) || "migration";
    mapped.archivedAt = null;
    mapped.archivedBy = null;
  }

  if (status === "archived") {
    mapped.archivedAt = normalizeDate(resource.archivedAt, updatedAt);
    mapped.archivedBy = cleanText(resource.archivedBy) || "migration";
  }

  return mapped;
}

async function main() {
  const projectRoot = process.cwd();
  initializeFirebase(projectRoot);

  const db = admin.firestore();
  const resourcesRef = db.collection("resources");
  const applicationsSnapshot = await db.collection("applications").get();
  const existingSharedSnapshot = await resourcesRef.get();
  const migratedLegacyPaths = new Set();

  for (const doc of existingSharedSnapshot.docs) {
    const legacyPath = doc.data()?.migration?.legacyResourcePath;
    if (legacyPath) {
      migratedLegacyPaths.add(legacyPath);
    }
  }

  const summary = {
    applicationsScanned: applicationsSnapshot.size,
    legacyResourcesScanned: 0,
    queued: 0,
    migrated: 0,
    skippedExisting: 0,
    skippedArchived: 0,
  };

  let batch = db.batch();
  let batchSize = 0;

  for (const applicationDoc of applicationsSnapshot.docs) {
    const application = applicationDoc.data() || {};
    const matterId =
      cleanText(application.zohoId) ||
      cleanText(application.zohoDealId) ||
      cleanText(application.dealId) ||
      applicationDoc.id;
    const reference = cleanText(application.reference);
    const resourcesSnapshot = await applicationDoc.ref.collection("resources").get();

    for (const resourceDoc of resourcesSnapshot.docs) {
      summary.legacyResourcesScanned += 1;

      const legacyPath = `${applicationDoc.ref.path}/resources/${resourceDoc.id}`;
      const legacyResource = resourceDoc.data() || {};
      const normalizedStatus = normalizeStatus(legacyResource.status);

      if (normalizedStatus === "archived" && !includeArchived) {
        summary.skippedArchived += 1;
        continue;
      }

      if (migratedLegacyPaths.has(legacyPath)) {
        summary.skippedExisting += 1;
        continue;
      }

      const mappedResource = mapLegacyResource(legacyResource, {
        appId: applicationDoc.id,
        resourceId: resourceDoc.id,
        legacyPath,
        matterId,
        reference,
      });

      summary.queued += 1;
      migratedLegacyPaths.add(legacyPath);

      if (dryRun) {
        continue;
      }

      const newResourceRef = resourcesRef.doc();
      batch.set(newResourceRef, mappedResource);
      batchSize += 1;
      summary.migrated += 1;

      if (batchSize >= 200) {
        await batch.commit();
        batch = db.batch();
        batchSize = 0;
      }
    }
  }

  if (!dryRun && batchSize > 0) {
    await batch.commit();
  }

  console.log("");
  console.log("Shared resource migration summary");
  console.log("--------------------------------");
  console.log(`Dry run: ${dryRun ? "yes" : "no"}`);
  console.log(`Included archived resources: ${includeArchived ? "yes" : "no"}`);
  console.log(`Applications scanned: ${summary.applicationsScanned}`);
  console.log(`Legacy resources scanned: ${summary.legacyResourcesScanned}`);
  console.log(`Queued for migration: ${summary.queued}`);
  console.log(`Migrated this run: ${dryRun ? 0 : summary.migrated}`);
  console.log(`Skipped (already migrated): ${summary.skippedExisting}`);
  console.log(`Skipped (archived and excluded): ${summary.skippedArchived}`);
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("");
    console.error("Shared resource migration failed");
    console.error("--------------------------------");
    console.error(error.stack || error.message || String(error));
    process.exit(1);
  });
