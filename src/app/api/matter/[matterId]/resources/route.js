import { NextResponse } from "next/server";
import { db, initResult } from "@/lib/firebase-admin";
import { resolveMatterApplication } from "@/lib/matterResolver";
import zohoClient from "@/lib/zohoClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const WORKDRIVE_FOLDER_FIELD = "Workdrive_Folder_ID";
const WORKDRIVE_FOLDER_FIELD_LEGACY = "WorkDrive_Folder_ID";

function errorResponse(error, status = 500, details = null) {
  return NextResponse.json({ success: false, error, details }, { status });
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function serializeTimestamp(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

function serializeResource(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt),
    archivedAt: serializeTimestamp(data.archivedAt),
  };
}

function normalizeResourceUrl(rawUrl) {
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

function sanitizeFileName(fileName) {
  return cleanText(fileName).replace(/[\\/:*?"<>|]/g, "-") || "resource";
}

function sanitizeLinkName(name) {
  return (
    cleanText(name)
      .replace(/[^a-zA-Z0-9 ._-]/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 80)
      .trim() || "resource"
  );
}

function normalizeFolderId(rawValue) {
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

function getDealId(application, matterId) {
  return (
    cleanText(application?.zohoId) ||
    cleanText(application?.zohoDealId) ||
    cleanText(application?.dealId) ||
    (application?.id !== matterId ? cleanText(matterId) : "")
  );
}

async function resolveMatter(matterId) {
  if (!db) {
    return {
      response: errorResponse(
        "Database not initialized",
        500,
        initResult?.error || "Unknown error"
      ),
    };
  }

  if (!matterId) {
    return { response: errorResponse("Matter ID is required", 400) };
  }

  const resolved = await resolveMatterApplication(db, matterId);
  if (!resolved) {
    return { response: errorResponse("Matter not found", 404) };
  }

  return { resolved };
}

async function getWorkDriveFolder(application, matterId) {
  const dealId = getDealId(application, matterId);

  if (!dealId) {
    return {
      error: "Zoho Deal ID is required before uploading files to WorkDrive",
      status: 400,
    };
  }

  const dealRecord = await zohoClient.getRecord(
    "Deals",
    dealId,
    `id,${WORKDRIVE_FOLDER_FIELD},${WORKDRIVE_FOLDER_FIELD_LEGACY}`
  );

  if (!dealRecord) {
    return {
      error: "Unable to fetch the Zoho Deal for WorkDrive folder lookup",
      status: 502,
    };
  }

  const folderId = normalizeFolderId(
    dealRecord[WORKDRIVE_FOLDER_FIELD] ?? dealRecord[WORKDRIVE_FOLDER_FIELD_LEGACY]
  );

  if (!folderId) {
    return {
      error: `${WORKDRIVE_FOLDER_FIELD} is missing on the Zoho Deal`,
      status: 400,
    };
  }

  return { dealId, folderId };
}

export async function GET(request, { params }) {
  try {
    const { matterId } = await params;
    const { resolved, response } = await resolveMatter(matterId);
    if (response) return response;

    const snapshot = await db
      .collection("applications")
      .doc(resolved.appId)
      .collection("resources")
      .orderBy("createdAt", "desc")
      .get();

    const resources = snapshot.docs
      .map(serializeResource)
      .filter((resource) => resource.status !== "archived");

    return NextResponse.json({ success: true, resources });
  } catch (error) {
    console.error("Error fetching resources:", error);
    return errorResponse("Failed to fetch resources", 500, error.message);
  }
}

export async function POST(request, { params }) {
  try {
    const { matterId } = await params;
    const { resolved, response } = await resolveMatter(matterId);
    if (response) return response;

    const formData = await request.formData();
    const type = cleanText(formData.get("type") || formData.get("resourceType")).toLowerCase();
    const titleInput = cleanText(formData.get("title"));
    const description = cleanText(formData.get("description"));

    if (!["file", "link"].includes(type)) {
      return errorResponse("Resource type must be file or link", 400);
    }

    const now = new Date();
    const resourcesRef = db
      .collection("applications")
      .doc(resolved.appId)
      .collection("resources");

    if (type === "link") {
      const url = normalizeResourceUrl(formData.get("url"));

      if (!url) {
        return errorResponse("A valid http or https URL is required", 400);
      }

      const resourceData = {
        type: "link",
        title: titleInput || new URL(url).hostname,
        description,
        url,
        publicUrl: url,
        status: "active",
        createdAt: now,
        updatedAt: now,
        createdBy: "admin",
      };

      const docRef = await resourcesRef.add(resourceData);
      return NextResponse.json(
        { success: true, resource: serializeResource({ id: docRef.id, data: () => resourceData }) },
        { status: 201 }
      );
    }

    const file = formData.get("file");

    if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
      return errorResponse("A file is required", 400);
    }

    if (file.size > MAX_FILE_SIZE) {
      return errorResponse("File uploads are limited to 50 MB", 400);
    }

    const originalFileName = sanitizeFileName(file.name);
    const title = titleInput || originalFileName;
    const workDriveFolder = await getWorkDriveFolder(resolved.application, matterId);

    if (workDriveFolder.error) {
      return errorResponse(workDriveFolder.error, workDriveFolder.status);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const upload = await zohoClient.uploadWorkDriveFile(
      workDriveFolder.folderId,
      buffer,
      originalFileName,
      file.type || "application/octet-stream"
    );
    const publicLink = await zohoClient.createWorkDrivePublicLink(
      upload.resourceId,
      sanitizeLinkName(title)
    );
    const publicUrl =
      publicLink.link ||
      publicLink.downloadUrl ||
      upload.downloadUrl ||
      upload.permalink;

    if (!publicUrl) {
      return errorResponse("WorkDrive did not return a usable public resource link", 502);
    }

    const resourceData = {
      type: "file",
      title,
      description,
      publicUrl,
      url: publicUrl,
      status: "active",
      createdAt: now,
      updatedAt: now,
      createdBy: "admin",
      fileName: originalFileName,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
      workDriveFolderId: workDriveFolder.folderId,
      workDriveResourceId: upload.resourceId,
      workDrivePublicLinkId: publicLink.linkId,
      workDrivePermalink: upload.permalink,
      downloadUrl: publicLink.downloadUrl || upload.downloadUrl || publicUrl,
    };

    const docRef = await resourcesRef.add(resourceData);
    return NextResponse.json(
      { success: true, resource: serializeResource({ id: docRef.id, data: () => resourceData }) },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating resource:", error);
    return errorResponse("Failed to create resource", 500, error.message);
  }
}
