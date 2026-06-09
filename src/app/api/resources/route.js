import { NextResponse } from "next/server";
import { db, initResult } from "@/lib/firebase-admin";
import { getAdminSession } from "@/lib/adminSession";
import {
  cleanText,
  MAX_SHARED_RESOURCE_FILE_SIZE,
  normalizeCategory,
  normalizeResourceScope,
  normalizeResourceStatus,
  normalizeResourceType,
  normalizeResourceUrl,
  serializeResourceDoc,
  uploadSharedResourceFile,
} from "@/lib/sharedResources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error, status = 500, details = null) {
  return NextResponse.json({ success: false, error, details }, { status });
}

function requireDatabase() {
  if (!db) {
    return errorResponse(
      "Database not initialized",
      500,
      initResult?.error || "Unknown error"
    );
  }

  return null;
}

async function requireAdmin() {
  const session = await getAdminSession();

  if (!session) {
    return {
      response: errorResponse("Admin authentication required", 401),
    };
  }

  return { session };
}

function applyStatusMetadata(resourceData, status, now, actor) {
  if (status === "active") {
    resourceData.publishedAt = now;
    resourceData.publishedBy = actor;
    resourceData.archivedAt = null;
    resourceData.archivedBy = null;
  }

  if (status === "archived") {
    resourceData.archivedAt = now;
    resourceData.archivedBy = actor;
  }
}

function resourceMatchesQuery(resource, query) {
  if (!query) return true;

  const lowerQuery = query.toLowerCase();
  return [
    resource.title,
    resource.description,
    resource.noteText,
    resource.fileName,
    resource.url,
    resource.category,
    resource.program,
    resource.audience,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(lowerQuery));
}

export async function GET(request) {
  try {
    const databaseError = requireDatabase();
    if (databaseError) return databaseError;

    const { response } = await requireAdmin();
    if (response) return response;

    const snapshot = await db.collection("resources").orderBy("updatedAt", "desc").get();
    const statusFilter = normalizeResourceStatus(
      request.nextUrl.searchParams.get("status"),
      null
    );
    const typeFilter = normalizeResourceType(request.nextUrl.searchParams.get("type"));
    const searchQuery = cleanText(request.nextUrl.searchParams.get("search")).toLowerCase();

    const resources = snapshot.docs
      .map(serializeResourceDoc)
      .filter((resource) => {
        if (statusFilter && resource.status !== statusFilter) return false;
        if (typeFilter && resource.type !== typeFilter) return false;
        return resourceMatchesQuery(resource, searchQuery);
      });

    return NextResponse.json({ success: true, resources });
  } catch (error) {
    console.error("Error fetching shared resources:", error);
    return errorResponse("Failed to fetch shared resources", 500, error.message);
  }
}

export async function POST(request) {
  try {
    const databaseError = requireDatabase();
    if (databaseError) return databaseError;

    const { session, response } = await requireAdmin();
    if (response) return response;

    const formData = await request.formData();
    const type = normalizeResourceType(formData.get("type") || formData.get("resourceType"));
    const status = normalizeResourceStatus(formData.get("status"), "draft");
    const scope = normalizeResourceScope(formData.get("scope"), "shared");
    const titleInput = cleanText(formData.get("title"));
    const description = cleanText(formData.get("description"));
    const category = normalizeCategory(formData.get("category"));
    const program = cleanText(formData.get("program"));
    const audience = cleanText(formData.get("audience"));
    const noteTextInput = cleanText(formData.get("noteText"));

    if (!type) {
      return errorResponse("Resource type must be file, link, or note", 400);
    }

    if (!status) {
      return errorResponse("Resource status is invalid", 400);
    }

    if (!scope) {
      return errorResponse("Resource scope is invalid", 400);
    }

    const now = new Date();
    const actor = session.role || "admin";
    const baseData = {
      type,
      description,
      category,
      status,
      scope,
      program,
      audience,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
    };

    let resourceData = null;

    if (type === "link") {
      const url = normalizeResourceUrl(formData.get("url"));

      if (!url) {
        return errorResponse("A valid http or https URL is required", 400);
      }

      resourceData = {
        ...baseData,
        title: titleInput || new URL(url).hostname,
        url,
        publicUrl: url,
      };
    }

    if (type === "note") {
      const noteText = noteTextInput || description;

      if (!noteText) {
        return errorResponse("Note text is required", 400);
      }

      resourceData = {
        ...baseData,
        title: titleInput || "Note",
        noteText,
        content: noteText,
      };
    }

    if (type === "file") {
      const file = formData.get("file");

      if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
        return errorResponse("A file is required", 400);
      }

      if (file.size > MAX_SHARED_RESOURCE_FILE_SIZE) {
        return errorResponse("File uploads are limited to 50 MB", 400);
      }

      const title = titleInput || cleanText(file.name) || "Shared file";
      const uploadResult = await uploadSharedResourceFile(file, title);

      if (uploadResult.error) {
        return errorResponse(uploadResult.error, uploadResult.status || 500);
      }

      resourceData = {
        ...baseData,
        ...uploadResult.data,
        title,
      };
    }

    applyStatusMetadata(resourceData, status, now, actor);

    const docRef = await db.collection("resources").add(resourceData);
    return NextResponse.json(
      {
        success: true,
        resource: serializeResourceDoc({ id: docRef.id, data: () => resourceData }),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating shared resource:", error);
    return errorResponse("Failed to create shared resource", 500, error.message);
  }
}
