import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { db } from "@/lib/firebase-admin";
import {
  getResourceTemplateDefinition,
  normalizeVisaSlug,
} from "@/lib/resourceTemplates";
import { reorderResourceTemplateItems } from "@/lib/resourceTemplateOrdering.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Admin session is required" },
        { status: 401 }
      );
    }
    if (!db) {
      return NextResponse.json(
        { success: false, error: "Database not initialized" },
        { status: 500 }
      );
    }

    const { visaSlug: rawVisaSlug } = await params;
    const visaSlug = normalizeVisaSlug(rawVisaSlug);
    if (!getResourceTemplateDefinition(visaSlug)) {
      return NextResponse.json(
        { success: false, error: "Choose one supported visa template before reordering" },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const result = await reorderResourceTemplateItems({
      db,
      visaSlug,
      category: typeof body?.category === "string" ? body.category : "",
      itemIds: body?.itemIds,
      actor: session.role || "admin",
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Error reordering resource template items:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.status
          ? error.message
          : "Failed to reorder resources. Refresh resources before retrying.",
      },
      { status: error.status || 500 }
    );
  }
}
