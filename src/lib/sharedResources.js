import zohoClient from "@/lib/zohoClient";
import { getResourceMimeType, getWorkDriveViewerUrl, validateResourceFile } from "./resourceFiles.mjs";
import { serializeStoredNoteFields } from "./richText.js";

export const MAX_SHARED_RESOURCE_FILE_SIZE = 50 * 1024 * 1024;
export const RESOURCE_TYPES = ["file", "link", "note"];
export const RESOURCE_STATUSES = ["draft", "active", "inactive", "archived"];
export const RESOURCE_SCOPES = ["shared", "group", "application"];
export const DEFAULT_RESOURCE_CATEGORY = "General";
const DEFAULT_SHARED_WORKDRIVE_FOLDER_URL =
  "https://workdrive.zoho.com.au/darpt4bf78c59b8684d9bb6b479804432d247/teams/darpt4bf78c59b8684d9bb6b479804432d247/ws/hf3e609480d012c3c4244bc51956d41cb7925/folders/files";

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
    ...serializeStoredNoteFields(data, {
      isNote: String(data.type || "").toLowerCase() === "note",
    }),
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

  const folderUrlPatterns = [
    /\/folders\/([^/?#]+)/,
    /\/ws\/([^/?#]+)\/folders(?:\/files)?(?:[/?#]|$)/,
  ];

  for (const pattern of folderUrlPatterns) {
    const match = value.match(pattern);
    if (match?.[1] && match[1] !== "files") {
      return match[1];
    }
  }

  return value;
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

  return normalizeFolderId(DEFAULT_SHARED_WORKDRIVE_FOLDER_URL);
}

export async function uploadSharedResourceFile(file, title) {
  const fileError = validateResourceFile(file);
  if (fileError) return { error: fileError, status: 400 };
  const folderId = getSharedWorkDriveFolderId();

  if (!folderId) {
    return {
      error:
        "Shared WorkDrive folder is not configured. Set SHARED_RESOURCES_WORKDRIVE_FOLDER_ID or WORKDRIVE_SHARED_FOLDER_ID.",
      status: 500,
    };
  }

  const originalFileName = sanitizeFileName(file.name);
  const mimeType = getResourceMimeType(file);
  const buffer = Buffer.from(await file.arrayBuffer());
  const upload = await zohoClient.uploadWorkDriveFile(
    folderId,
    buffer,
    originalFileName,
    mimeType
  );
  let publicLink;
  try {
    publicLink = await zohoClient.createWorkDrivePublicLink(
      upload.resourceId,
      sanitizeLinkName(title || originalFileName),
      { allowDownload: false }
    );
    if (publicLink.allowDownload !== false || !getWorkDriveViewerUrl(publicLink.link)) {
      throw new Error("WorkDrive did not confirm a view-only resource link");
    }
  } catch (error) {
    await zohoClient.deleteWorkDriveResource(upload.resourceId).catch((cleanupError) => {
      console.error("Failed to clean up WorkDrive resource:", cleanupError.message);
    });
    throw error;
  }
  const publicUrl = publicLink.link;

  return {
    data: {
      publicUrl,
      url: publicUrl,
      fileName: originalFileName,
      mimeType,
      fileSize: file.size,
      workDriveFolderId: folderId,
      workDriveResourceId: upload.resourceId,
      workDrivePublicLinkId: publicLink.linkId,
      downloadAllowed: false,
    },
  };
}
