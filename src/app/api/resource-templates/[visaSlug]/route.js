import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { db, initResult } from "@/lib/firebase-admin";
import {
  cleanText,
} from "@/lib/sharedResources";
import {
  ensureResourceTemplate,
  getTemplateItems,
  normalizeTemplateCategories,
  normalizeTemplateStatus,
  normalizeVisaSlug,
  serializeTemplateDoc,
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

export async function GET(_request, { params }) {
  try {
    const databaseError = requireDatabase();
    if (databaseError) return databaseError;

    const { actor, response: adminError } = await requireAdmin();
    if (adminError) return adminError;

    const { template, response } = await resolveTemplate(params, actor);
    if (response) return response;

    const items = await getTemplateItems(db, template.visaSlug);
    return NextResponse.json({ success: true, template, items });
  } catch (error) {
    console.error("Error fetching resource template:", error);
    return errorResponse("Failed to fetch resource template", 500, error.message);
  }
}

export async function PATCH(request, { params }) {
  try {
    const databaseError = requireDatabase();
    if (databaseError) return databaseError;

    const { actor, response: adminError } = await requireAdmin();
    if (adminError) return adminError;

    const { ref, response } = await resolveTemplate(params, actor);
    if (response) return response;

    const body = await request.json().catch(() => ({}));
    const updates = {};
    const now = new Date();

    if (Object.prototype.hasOwnProperty.call(body, "title")) {
      const title = cleanText(body.title);
      if (!title) {
        return errorResponse("Template title is required", 400);
      }

      updates.title = title;
    }

    if (Object.prototype.hasOwnProperty.call(body, "status")) {
      const status = normalizeTemplateStatus(body.status, null);
      if (!status) {
        return errorResponse("Template status is invalid", 400);
      }

      updates.status = status;

      if (status === "active") {
        updates.publishedAt = now;
        updates.publishedBy = actor;
        updates.archivedAt = null;
        updates.archivedBy = null;
      }

      if (status === "archived") {
        updates.archivedAt = now;
        updates.archivedBy = actor;
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "categories")) {
      const categories = normalizeTemplateCategories(body.categories);
      if (!categories.length) {
        return errorResponse("At least one category is required", 400);
      }

      updates.categories = categories;
    }

    if (!Object.keys(updates).length) {
      return errorResponse("No supported fields were provided", 400);
    }

    updates.updatedAt = now;
    updates.updatedBy = actor;

    await ref.update(updates);
    const updatedSnap = await ref.get();

    return NextResponse.json({
      success: true,
      template: serializeTemplateDoc(updatedSnap),
    });
  } catch (error) {
    console.error("Error updating resource template:", error);
    return errorResponse("Failed to update resource template", 500, error.message);
  }
}
