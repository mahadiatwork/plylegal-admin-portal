import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { db, initResult } from "@/lib/firebase-admin";
import { cleanText } from "@/lib/sharedResources";
import {
  ensureResourceTemplate,
  getTemplateItems,
  normalizeResourceUrl,
  normalizeTemplateItemStatus,
  normalizeTemplateOrder,
  normalizeTemplateParentId,
  normalizeVisaSlug,
  serializeTemplateItemDoc,
  validateTemplateParent,
  wouldCreateFolderCycle,
} from "@/lib/resourceTemplates";

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
    return { response: errorResponse("Admin session is required", 401) };
  }

  return { actor: session.role || "admin" };
}

async function resolveTemplate(params, actor) {
  const { visaSlug: rawVisaSlug } = await params;
  const visaSlug = normalizeVisaSlug(rawVisaSlug);
  const ensured = await ensureResourceTemplate(db, visaSlug, actor);

  if (ensured.error) {
    return { response: errorResponse(ensured.error, ensured.status || 500) };
  }

  return ensured;
}

export async function PATCH(request, { params }) {
  try {
    const databaseError = requireDatabase();
    if (databaseError) return databaseError;

    const { actor, response: adminError } = await requireAdmin();
    if (adminError) return adminError;

    const { itemId } = await params;
    if (!itemId) {
      return errorResponse("Item ID is required", 400);
    }

    const { ref: templateRef, template, response } = await resolveTemplate(params, actor);
    if (response) return response;

    const itemRef = templateRef.collection("items").doc(itemId);
    const itemSnap = await itemRef.get();

    if (!itemSnap.exists) {
      return errorResponse("Template item not found", 404);
    }

    const currentItem = { id: itemSnap.id, ...itemSnap.data() };
    const body = await request.json().catch(() => ({}));
    const updates = {};
    const now = new Date();

    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      const name = cleanText(body.name);
      if (!name) {
        return errorResponse("Item name is required", 400);
      }

      updates.name = name;
    }

    if (Object.prototype.hasOwnProperty.call(body, "parentId")) {
      const parentId = normalizeTemplateParentId(body.parentId);

      if (parentId === itemId) {
        return errorResponse("An item cannot be nested inside itself", 400);
      }

      const parentValidation = await validateTemplateParent(
        db,
        template.visaSlug,
        parentId
      );
      if (!parentValidation.valid) {
        return errorResponse(parentValidation.error, parentValidation.status || 400);
      }

      if (currentItem.kind === "folder") {
        const items = await getTemplateItems(db, template.visaSlug);
        if (wouldCreateFolderCycle(items, itemId, parentId)) {
          return errorResponse("Folder nesting cannot create a cycle", 400);
        }
      }

      updates.parentId = parentId;
    }

    if (Object.prototype.hasOwnProperty.call(body, "order")) {
      const order = normalizeTemplateOrder(body.order, currentItem.order || 0);
      if (order === null) {
        return errorResponse("Item order must be a number", 400);
      }

      updates.order = order;
    }

    if (Object.prototype.hasOwnProperty.call(body, "status")) {
      const status = normalizeTemplateItemStatus(body.status, null);
      if (!status) {
        return errorResponse("Item status is invalid", 400);
      }

      updates.status = status;
      if (status === "hidden" && currentItem.status !== "hidden") {
        updates.hiddenAt = now;
        updates.hiddenBy = actor;
      }
      if (status === "active") {
        updates.hiddenAt = null;
        updates.hiddenBy = null;
      }
    }

    const linkUrlWasProvided =
      Object.prototype.hasOwnProperty.call(body, "externalUrl") ||
      Object.prototype.hasOwnProperty.call(body, "url");

    if (linkUrlWasProvided) {
      if (currentItem.kind !== "link") {
        return errorResponse("Only link items can update externalUrl", 400);
      }

      const externalUrl = normalizeResourceUrl(body.externalUrl || body.url);
      if (!externalUrl) {
        return errorResponse("A valid http or https URL is required", 400);
      }

      updates.externalUrl = externalUrl;
    }

    if (!Object.keys(updates).length) {
      return errorResponse("No supported fields were provided", 400);
    }

    updates.updatedAt = now;
    updates.updatedBy = actor;

    await itemRef.update(updates);
    await templateRef.update({
      updatedAt: now,
      updatedBy: actor,
    });

    const updatedSnap = await itemRef.get();
    return NextResponse.json({
      success: true,
      item: serializeTemplateItemDoc(updatedSnap),
    });
  } catch (error) {
    console.error("Error updating resource template item:", error);
    return errorResponse("Failed to update resource template item", 500, error.message);
  }
}
