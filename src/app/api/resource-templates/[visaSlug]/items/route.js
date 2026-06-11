import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { db, initResult } from "@/lib/firebase-admin";
import { cleanText } from "@/lib/sharedResources";
import {
  ensureResourceTemplate,
  normalizeResourceUrl,
  normalizeTemplateItemKind,
  normalizeTemplateItemStatus,
  normalizeTemplateOrder,
  normalizeTemplateParentId,
  normalizeVisaSlug,
  serializeTemplateItemDoc,
  uploadResourceTemplateFile,
  validateTemplateParent,
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

export async function POST(request, { params }) {
  try {
    const databaseError = requireDatabase();
    if (databaseError) return databaseError;

    const { actor, response: adminError } = await requireAdmin();
    if (adminError) return adminError;

    const { definition, ref: templateRef, template, response } = await resolveTemplate(
      params,
      actor
    );
    if (response) return response;

    const formData = await request.formData();
    const kind = normalizeTemplateItemKind(formData.get("kind") || formData.get("type"));
    const status = normalizeTemplateItemStatus(formData.get("status"), "active");
    const parentId = normalizeTemplateParentId(formData.get("parentId"));
    const order = normalizeTemplateOrder(formData.get("order"), 0);
    const nameInput = cleanText(formData.get("name") || formData.get("title"));

    if (!kind) {
      return errorResponse("Item kind must be folder, file, link, or note", 400);
    }

    if (!status) {
      return errorResponse("Item status is invalid", 400);
    }

    if (order === null) {
      return errorResponse("Item order must be a number", 400);
    }

    const parentValidation = await validateTemplateParent(db, template.visaSlug, parentId);
    if (!parentValidation.valid) {
      return errorResponse(parentValidation.error, parentValidation.status || 400);
    }

    const now = new Date();
    const itemData = {
      parentId,
      kind,
      name: nameInput,
      order,
      status,
      externalUrl: null,
      workdriveId: null,
      mimeType: null,
      size: null,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
    };

    if (kind === "folder") {
      if (!nameInput) {
        return errorResponse("Folder name is required", 400);
      }
    }

    if (kind === "link") {
      const externalUrl = normalizeResourceUrl(
        formData.get("externalUrl") || formData.get("url")
      );

      if (!externalUrl) {
        return errorResponse("A valid http or https URL is required", 400);
      }

      itemData.name = nameInput || new URL(externalUrl).hostname;
      itemData.externalUrl = externalUrl;
    }

    if (kind === "note") {
      const noteText = cleanText(
        formData.get("noteText") ||
          formData.get("content") ||
          formData.get("description")
      );

      if (!nameInput) {
        return errorResponse("Note name is required", 400);
      }

      if (!noteText) {
        return errorResponse("Note text is required", 400);
      }

      Object.assign(itemData, {
        noteText,
        content: noteText,
      });
    }

    if (kind === "file") {
      const file = formData.get("file");
      const title = nameInput || cleanText(file?.name) || "Template file";
      const uploadResult = await uploadResourceTemplateFile(
        file,
        title,
        definition.workDriveFolderId
      );

      if (uploadResult.error) {
        return errorResponse(uploadResult.error, uploadResult.status || 500);
      }

      Object.assign(itemData, uploadResult.data, {
        name: title,
        workDriveTemplateRootFolderId: definition.workDriveFolderId,
      });
    }

    const itemRef = await templateRef.collection("items").add(itemData);
    await templateRef.update({
      updatedAt: now,
      updatedBy: actor,
      workDriveFolderId: definition.workDriveFolderId,
    });

    return NextResponse.json(
      {
        success: true,
        item: serializeTemplateItemDoc({ id: itemRef.id, data: () => itemData }),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating resource template item:", error);
    return errorResponse("Failed to create resource template item", 500, error.message);
  }
}
