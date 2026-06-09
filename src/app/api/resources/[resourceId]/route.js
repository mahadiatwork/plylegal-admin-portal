import { NextResponse } from "next/server";
import { db, initResult } from "@/lib/firebase-admin";
import { getAdminSession } from "@/lib/adminSession";
import {
  cleanText,
  normalizeCategory,
  normalizeResourceScope,
  normalizeResourceStatus,
  normalizeResourceUrl,
  serializeResourceDoc,
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

function applyStatusTransition(updates, nextStatus, currentStatus, now, actor) {
  if (!nextStatus || nextStatus === currentStatus) {
    return;
  }

  updates.status = nextStatus;

  if (nextStatus === "active") {
    updates.publishedAt = now;
    updates.publishedBy = actor;
    updates.archivedAt = null;
    updates.archivedBy = null;
  }

  if (nextStatus === "archived") {
    updates.archivedAt = now;
    updates.archivedBy = actor;
  }

  if (currentStatus === "archived" && nextStatus !== "archived") {
    updates.archivedAt = null;
    updates.archivedBy = null;
  }
}

export async function PATCH(request, { params }) {
  try {
    const databaseError = requireDatabase();
    if (databaseError) return databaseError;

    const { session, response } = await requireAdmin();
    if (response) return response;

    const { resourceId } = await params;

    if (!resourceId) {
      return errorResponse("Resource ID is required", 400);
    }

    const resourceRef = db.collection("resources").doc(resourceId);
    const resourceSnap = await resourceRef.get();

    if (!resourceSnap.exists) {
      return errorResponse("Resource not found", 404);
    }

    const currentResource = { id: resourceSnap.id, ...resourceSnap.data() };
    const body = await request.json().catch(() => ({}));
    const updates = {};
    const now = new Date();
    const actor = session.role || "admin";

    if (Object.prototype.hasOwnProperty.call(body, "title")) {
      const title = cleanText(body.title);

      if (!title) {
        return errorResponse("Title is required", 400);
      }

      updates.title = title;
    }

    if (Object.prototype.hasOwnProperty.call(body, "description")) {
      updates.description = cleanText(body.description);
    }

    if (Object.prototype.hasOwnProperty.call(body, "category")) {
      updates.category = normalizeCategory(body.category);
    }

    if (Object.prototype.hasOwnProperty.call(body, "scope")) {
      const scope = normalizeResourceScope(body.scope, null);

      if (!scope) {
        return errorResponse("Resource scope is invalid", 400);
      }

      updates.scope = scope;
    }

    if (Object.prototype.hasOwnProperty.call(body, "program")) {
      updates.program = cleanText(body.program);
    }

    if (Object.prototype.hasOwnProperty.call(body, "audience")) {
      updates.audience = cleanText(body.audience);
    }

    if (currentResource.type === "link" && Object.prototype.hasOwnProperty.call(body, "url")) {
      const url = normalizeResourceUrl(body.url);

      if (!url) {
        return errorResponse("A valid http or https URL is required", 400);
      }

      updates.url = url;
      updates.publicUrl = url;
    }

    if (currentResource.type === "note") {
      const noteTextWasProvided = Object.prototype.hasOwnProperty.call(body, "noteText");
      const descriptionWasProvided = Object.prototype.hasOwnProperty.call(body, "description");

      if (noteTextWasProvided || descriptionWasProvided) {
        const noteText = cleanText(
          noteTextWasProvided ? body.noteText : body.description ?? currentResource.noteText
        );

        if (!noteText) {
          return errorResponse("Note text is required", 400);
        }

        updates.noteText = noteText;
        updates.content = noteText;
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "status")) {
      const nextStatus = normalizeResourceStatus(body.status, null);

      if (!nextStatus) {
        return errorResponse("Resource status is invalid", 400);
      }

      applyStatusTransition(updates, nextStatus, currentResource.status, now, actor);
    }

    if (!Object.keys(updates).length) {
      return errorResponse("No supported fields were provided", 400);
    }

    updates.updatedAt = now;
    updates.updatedBy = actor;

    await resourceRef.update(updates);

    const updatedSnap = await resourceRef.get();
    return NextResponse.json({
      success: true,
      resource: serializeResourceDoc(updatedSnap),
    });
  } catch (error) {
    console.error("Error updating shared resource:", error);
    return errorResponse("Failed to update shared resource", 500, error.message);
  }
}

export async function DELETE(_request, { params }) {
  try {
    const databaseError = requireDatabase();
    if (databaseError) return databaseError;

    const { response } = await requireAdmin();
    if (response) return response;

    const { resourceId } = await params;

    if (!resourceId) {
      return errorResponse("Resource ID is required", 400);
    }

    const resourceRef = db.collection("resources").doc(resourceId);
    const resourceSnap = await resourceRef.get();

    if (!resourceSnap.exists) {
      return errorResponse("Resource not found", 404);
    }

    await resourceRef.delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting shared resource:", error);
    return errorResponse("Failed to delete shared resource", 500, error.message);
  }
}
