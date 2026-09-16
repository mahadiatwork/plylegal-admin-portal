import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { db, initResult } from "@/lib/firebase-admin";
import { resolveMatterApplication } from "@/lib/matterResolver";
import { isPdfUpload } from "@/lib/pdfUploadRules.mjs";
import { getResourceMimeType } from "@/lib/resourceFiles.mjs";
import { normalizeMatterResourceCategories } from "@/lib/matterResourceCategories.mjs";
import {
  createViewOnlyMatterResourceLink,
  normalizeMatterResourceOrder,
  reorderMatterResources,
  sortMatterResources,
} from "@/lib/matterResources.mjs";
import zohoClient from "@/lib/zohoClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const DOCUMENT_SOURCE = "documentReview";
const FINAL_FILE_FIELD = "Final_File_For_Visa_Submission";
const DEFAULT_DOCUMENT_REVIEW_FOLDER_URL =
  "https://workdrive.zoho.com.au/darpt4bf78c59b8684d9bb6b479804432d247/teams/darpt4bf78c59b8684d9bb6b479804432d247/ws/hf3e609480d012c3c4244bc51956d41cb7925/folders/h8zdkeb46cf4752f14337b5b7508081031550";
const WORKDRIVE_FOLDER_FIELDS = [
  "Workdrive_Folder_ID",
  "WorkDrive_Folder_ID",
  "Matter_Folder_ID",
  "Matter_Workdrive_Folder_URL",
  "Matter_Folder_URL",
];

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

function sanitizeFolderName(name) {
  return (
    cleanText(name)
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, " ")
      .slice(0, 180)
      .trim() || "Matter"
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

  if (/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value)) return value;

  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;

    const folderUrlMatch = url.pathname.match(/\/folders?\/([A-Za-z0-9][A-Za-z0-9_-]*)\/?$/);
    if (folderUrlMatch && folderUrlMatch[1] !== "files") return folderUrlMatch[1];

    const workspaceUrlMatch = url.pathname.match(
      /\/ws\/([A-Za-z0-9][A-Za-z0-9_-]*)\/folders(?:\/files)?\/?$/
    );
    return workspaceUrlMatch?.[1] || null;
  } catch {
    return null;
  }
}

function getDocumentReviewRootFolderId() {
  return normalizeFolderId(
    process.env.DOCUMENT_REVIEW_WORKDRIVE_FOLDER_ID ||
      process.env.WORKDRIVE_DOCUMENT_REVIEW_FOLDER_ID ||
      DEFAULT_DOCUMENT_REVIEW_FOLDER_URL
  );
}

function getDealId(application, matterId) {
  return (
    cleanText(application?.zohoId) ||
    cleanText(application?.zohoDealId) ||
    cleanText(application?.dealId) ||
    (application?.id !== matterId ? cleanText(matterId) : "")
  );
}

async function saveDocumentReviewSubmissionUrl(dealId, url) {
  const value = cleanText(url);
  if (!value) return;

  if (dealId) {
    await zohoClient.updateRecord("Deals", dealId, { [FINAL_FILE_FIELD]: value });
  }
}

function getMatterName(application) {
  return (
    cleanText(application?.reference) ||
    cleanText(application?.matterReference) ||
    cleanText(application?.name) ||
    cleanText(application?.Name) ||
    cleanText(application?.Deal_Name) ||
    cleanText(application?.DealName) ||
    "Matter"
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
    ["id", ...WORKDRIVE_FOLDER_FIELDS].join(",")
  );

  if (!dealRecord) {
    return {
      error: "Unable to fetch the Zoho Deal for WorkDrive folder lookup",
      status: 502,
    };
  }

  const folderId = WORKDRIVE_FOLDER_FIELDS
    .map((field) => normalizeFolderId(dealRecord[field]))
    .find(Boolean);

  if (!folderId) {
    return {
      error: "No usable WorkDrive folder ID or folder URL is configured on the Zoho Deal",
      status: 400,
    };
  }

  return { dealId, folderId };
}

async function getDocumentReviewWorkDriveFolder(application, matterId) {
  const rootFolderId = getDocumentReviewRootFolderId();
  const dealId = getDealId(application, matterId);

  if (!rootFolderId) {
    return {
      error: "Document Review WorkDrive folder is not configured",
      status: 500,
    };
  }

  if (!dealId && !matterId) {
    return {
      error: "Matter ID is required before uploading files to WorkDrive",
      status: 400,
    };
  }

  const matterFolderName = sanitizeFolderName(
    `${getMatterName(application)} - ${dealId || matterId}`
  );
  const folder = await zohoClient.findOrCreateWorkDriveFolder(rootFolderId, matterFolderName);

  return {
    dealId,
    folderId: folder.resourceId,
    rootFolderId,
    matterFolderName,
    matterFolderCreated: folder.created,
  };
}

export async function GET(request, { params }) {
  try {
    if (!(await getAdminSession())) {
      return errorResponse("Admin session is required", 401);
    }

    const { matterId } = await params;
    const { resolved, response } = await resolveMatter(matterId);
    if (response) return response;

    const snapshot = await db
      .collection("applications")
      .doc(resolved.appId)
      .collection("resources")
      .get();

    const resources = sortMatterResources(
      snapshot.docs
        .map(serializeResource)
        .filter(
          (resource) =>
            resource.status !== "archived" ||
            resource.workDriveCleanupPending === true
        )
    );

    const categories = normalizeMatterResourceCategories(
      resolved.application?.resourceCategories,
      resources
    );
    return NextResponse.json({ success: true, resources, categories });
  } catch (error) {
    console.error("Error fetching resources:", error);
    return errorResponse("Failed to fetch resources", 500, error.message);
  }
}

export async function PATCH(request, { params }) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return errorResponse("Admin session is required", 401);
    }

    const { matterId } = await params;
    const { resolved, response } = await resolveMatter(matterId);
    if (response) return response;

    const body = await request.json().catch(() => ({}));
    const result = await reorderMatterResources({
      db,
      appId: resolved.appId,
      category: body.category,
      itemIds: body.itemIds,
      actor: session.role || "admin",
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Error reordering matter resources:", error);
    return errorResponse(
      error.status ? error.message : "Failed to reorder matter resources",
      error.status || 500,
      error.status ? null : error.message
    );
  }
}

export async function POST(request, { params }) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return errorResponse("Admin session is required", 401);
    }

    const { matterId } = await params;
    const { resolved, response } = await resolveMatter(matterId);
    if (response) return response;

    const formData = await request.formData();
    const type = cleanText(formData.get("type") || formData.get("resourceType")).toLowerCase();
    const titleInput = cleanText(formData.get("title"));
    const description = cleanText(formData.get("description"));
    const source = cleanText(formData.get("source"));
    const category = cleanText(formData.get("category"));
    const order = normalizeMatterResourceOrder(formData.get("order"));

    if (order === null) {
      return errorResponse("Resource order must be a number", 400);
    }

    const metadata = {
      ...(source ? { source } : {}),
      ...(category ? { category } : {}),
      ...(order !== undefined ? { order } : {}),
    };

    if (!["file", "link", "note"].includes(type)) {
      return errorResponse("Resource type must be file, link, or note", 400);
    }

    if (source === DOCUMENT_SOURCE && type !== "file") {
      return errorResponse("Document review resources must be PDF files", 400);
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
        externalUrl: url,
        status: "active",
        createdAt: now,
        updatedAt: now,
        createdBy: session.role || "admin",
        ...metadata,
      };

      const docRef = await resourcesRef.add(resourceData);
      return NextResponse.json(
        { success: true, resource: serializeResource({ id: docRef.id, data: () => resourceData }) },
        { status: 201 }
      );
    }

    if (type === "note") {
      if (!description) {
        return errorResponse("Note text is required", 400);
      }

      const resourceData = {
        type: "note",
        title: titleInput || "Note",
        description,
        noteText: description,
        content: description,
        status: "active",
        createdAt: now,
        updatedAt: now,
        createdBy: session.role || "admin",
        ...metadata,
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
    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = getResourceMimeType(file);

    if (source === DOCUMENT_SOURCE && !isPdfUpload(originalFileName, buffer)) {
      return errorResponse("Only PDF files can be uploaded for document review", 400);
    }

    const workDriveFolder =
      source === DOCUMENT_SOURCE
        ? await getDocumentReviewWorkDriveFolder(resolved.application, matterId)
        : await getWorkDriveFolder(resolved.application, matterId);

    if (workDriveFolder.error) {
      return errorResponse(workDriveFolder.error, workDriveFolder.status);
    }

    const upload = await zohoClient.uploadWorkDriveFile(
      workDriveFolder.folderId,
      buffer,
      originalFileName,
      mimeType
    );

    let publicLink;
    let publicUrl;
    if (source === DOCUMENT_SOURCE) {
      publicLink = await zohoClient.createWorkDrivePublicLink(
        upload.resourceId,
        sanitizeLinkName(title)
      );
      publicUrl =
        publicLink.link ||
        publicLink.downloadUrl ||
        upload.downloadUrl ||
        upload.permalink;
    } else {
      const restrictedLink = await createViewOnlyMatterResourceLink({
        zohoClient,
        workDriveResourceId: upload.resourceId,
        linkName: sanitizeLinkName(title),
      });
      publicLink = restrictedLink.publicLink;
      publicUrl = restrictedLink.viewerUrl;
    }
    const shareUrl = publicLink.link || publicUrl;

    if (!publicUrl) {
      return errorResponse("WorkDrive did not return a usable public resource link", 502);
    }

    if (source === DOCUMENT_SOURCE) {
      try {
        await saveDocumentReviewSubmissionUrl(workDriveFolder.dealId, publicUrl);
      } catch (saveError) {
        await zohoClient.deleteWorkDriveResource(upload.resourceId).catch((deleteError) => {
          console.error(
            "Failed to clean up WorkDrive file after matter URL save failed:",
            deleteError
          );
        });
        throw saveError;
      }
    }

    const resourceData = {
      type: "file",
      title,
      description,
      publicUrl,
      url: publicUrl,
      externalUrl: publicUrl,
      status: "active",
      createdAt: now,
      updatedAt: now,
      createdBy: session.role || "admin",
      ...metadata,
      fileName: originalFileName,
      mimeType,
      fileSize: file.size,
      workDriveFolderId: workDriveFolder.folderId,
      workDriveRootFolderId: workDriveFolder.rootFolderId || null,
      workDriveMatterFolderName: workDriveFolder.matterFolderName || null,
      workDriveResourceId: upload.resourceId,
      workDrivePublicLinkId: publicLink.linkId,
      workDriveShareUrl: shareUrl,
      ...(source === DOCUMENT_SOURCE
        ? {
            workDrivePermalink: upload.permalink,
            downloadUrl: publicLink.downloadUrl || upload.downloadUrl || publicUrl,
          }
        : { downloadAllowed: false }),
    };

    const docRef = resourcesRef.doc();
    if (source === DOCUMENT_SOURCE) {
      const batch = db.batch();
      batch.set(docRef, resourceData);
      batch.set(
        db.collection("applications").doc(resolved.appId),
        {
          [FINAL_FILE_FIELD]: publicUrl,
          updatedAt: now,
        },
        { merge: true }
      );
      await batch.commit();
    } else {
      await docRef.set(resourceData);
    }

    return NextResponse.json(
      { success: true, resource: serializeResource({ id: docRef.id, data: () => resourceData }) },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating resource:", error);
    return errorResponse("Failed to create resource", 500, error.message);
  }
}
