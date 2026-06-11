import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { db, initResult } from "@/lib/firebase-admin";
import {
  ensureResourceTemplate,
  getResourceTemplateDefinitions,
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

export async function GET() {
  try {
    const databaseError = requireDatabase();
    if (databaseError) return databaseError;

    const { actor, response } = await requireAdmin();
    if (response) return response;

    const templates = [];

    for (const definition of getResourceTemplateDefinitions()) {
      const ensured = await ensureResourceTemplate(db, definition.visaSlug, actor);
      if (ensured.error) {
        return errorResponse(ensured.error, ensured.status || 500);
      }

      const itemsSnapshot = await ensured.ref.collection("items").get();
      templates.push({
        ...ensured.template,
        itemCount: itemsSnapshot.size,
        activeItemCount: itemsSnapshot.docs.filter(
          (doc) => doc.data()?.status !== "hidden"
        ).length,
      });
    }

    return NextResponse.json({ success: true, templates });
  } catch (error) {
    console.error("Error fetching resource templates:", error);
    return errorResponse("Failed to fetch resource templates", 500, error.message);
  }
}
