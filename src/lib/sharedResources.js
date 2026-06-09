import zohoClient from "@/lib/zohoClient";

export const MAX_SHARED_RESOURCE_FILE_SIZE = 50 * 1024 * 1024;
export const RESOURCE_TYPES = ["file", "link", "note"];
export const RESOURCE_STATUSES = ["draft", "active", "inactive", "archived"];
export const RESOURCE_SCOPES = ["shared", "group", "application"];
export const DEFAULT_RESOURCE_CATEGORY = "General";

export function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function serializeTimestamp(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function serializeResourceDoc(doc) {
  const data = doc.data();

  return {
    id: doc.id,
    ...data,
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt),
    archivedAt: serializeTimestamp(data.archivedAt),
    publishedAt: serializeTimestamp(data.publishedAt),
  };
}

export function normalizeResourceType(rawValue) {
  const value = cleanText(rawValue).toLowerCase();
  return RESOURCE_TYPES.includes(value) ? value : null;
}

export function normalizeResourceStatus(rawValue, fallback = "draft") {
  const value = cleanText(rawValue).toLowerCase();

  if (!value) {
    return fallback;
  }

  return RESOURCE_STATUSES.includes(value) ? value : null;
}

export function normalizeResourceScope(rawValue, fallback = "shared") {
  const value = cleanText(rawValue).toLowerCase();

  if (!value) {
    return fallback;
  }

  return RESOURCE_SCOPES.includes(value) ? value : null;
}

export function normalizeCategory(rawValue) {
  return cleanText(rawValue) || DEFAULT_RESOURCE_CATEGORY;
}

export function normalizeResourceUrl(rawUrl) {
  const value = cleanText(rawUrl);
  if (!value) return null;

  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function sanitizeFileName(fileName) {
  return cleanText(fileName).replace(/[\\/:*?"<>|]/g, "-") || "resource";
}

export function sanitizeLinkName(name) {
  return (
    cleanText(name)
      .replace(/[^a-zA-Z0-9 ._-]/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 80)
      .trim() || "resource"
  );
}

export function normalizeFolderId(rawValue) {
  let value = rawValue;

  if (Array.isArray(value)) {
    value = value[0];
  }

  if (value && typeof value === "object") {
    value = value.id || value.value || value.name || "";
  }

  value = cleanText(value);
  if (!value) return null;

  const folderUrlMatch = value.match(/\/folders\/([^/?#]+)/);
  return folderUrlMatch?.[1] || value;
}

export function getSharedWorkDriveFolderId() {
  const candidateKeys = [
    "SHARED_RESOURCES_WORKDRIVE_FOLDER_ID",
    "WORKDRIVE_SHARED_FOLDER_ID",
    "SHARED_WORKDRIVE_FOLDER_ID",
    "WORKDRIVE_FOLDER_ID",
  ];

  for (const key of candidateKeys) {
    const folderId = normalizeFolderId(process.env[key]);
    if (folderId) {
      return folderId;
    }
  }

  return null;
}

export async function uploadSharedResourceFile(file, title) {
  const folderId = getSharedWorkDriveFolderId();

  if (!folderId) {
    return {
      error:
        "Shared WorkDrive folder is not configured. Set SHARED_RESOURCES_WORKDRIVE_FOLDER_ID or WORKDRIVE_SHARED_FOLDER_ID.",
      status: 500,
    };
  }

  const originalFileName = sanitizeFileName(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  const upload = await zohoClient.uploadWorkDriveFile(
    folderId,
    buffer,
    originalFileName,
    file.type || "application/octet-stream"
  );
  const publicLink = await zohoClient.createWorkDrivePublicLink(
    upload.resourceId,
    sanitizeLinkName(title || originalFileName)
  );
  const publicUrl =
    publicLink.link ||
    publicLink.downloadUrl ||
    upload.downloadUrl ||
    upload.permalink;

  if (!publicUrl) {
    return {
      error: "WorkDrive did not return a usable public resource link",
      status: 502,
    };
  }

  return {
    data: {
      publicUrl,
      url: publicUrl,
      fileName: originalFileName,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
      workDriveFolderId: folderId,
      workDriveResourceId: upload.resourceId,
      workDrivePublicLinkId: publicLink.linkId,
      workDrivePermalink: upload.permalink,
      downloadUrl: publicLink.downloadUrl || upload.downloadUrl || publicUrl,
    },
  };
}
